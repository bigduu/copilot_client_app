use crate::error::ContextError;
use crate::fsm::ChatEvent;
use crate::message_pipeline::MessagePipeline;
use crate::structs::context::ChatContext;
use crate::structs::events::{ContextUpdate, MessageUpdate};
use crate::structs::message::{
    ContentPart, IncomingMessage, IncomingTextMessage, InternalMessage, MessageContentSlice,
    MessageTextSnapshot, MessageType, Role,
};
use crate::structs::message_types::{RichMessageType, StreamingResponseMsg};
use crate::structs::metadata::{MessageMetadata, MessageSource, StreamingMetadata};
use crate::structs::state::ContextState;
use crate::structs::tool::ToolCallResult;
use chrono::Utc;
use eventsource_stream::{Event as SseEvent, EventStreamError};
use futures::stream::{self, BoxStream};
use futures::{Stream, StreamExt};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

impl ChatContext {
    pub fn mark_dirty(&mut self) {
        tracing::debug!(
            context_id = %self.id,
            "ChatContext: mark_dirty - context needs saving"
        );
        self.dirty = true;
    }

    pub fn clear_dirty(&mut self) {
        tracing::debug!(
            context_id = %self.id,
            "ChatContext: clear_dirty - context saved"
        );
        self.dirty = false;
    }

    pub fn is_dirty(&self) -> bool {
        tracing::debug!(
            context_id = %self.id,
            dirty = self.dirty,
            "ChatContext: is_dirty check"
        );
        self.dirty
    }

    pub fn set_trace_id(&mut self, trace_id: String) {
        self.trace_id = Some(trace_id);
    }

    pub fn get_trace_id(&self) -> Option<&str> {
        self.trace_id.as_deref()
    }

    pub fn clear_trace_id(&mut self) {
        self.trace_id = None;
    }

    pub fn send_message(
        &mut self,
        message: IncomingMessage,
    ) -> Result<BoxStream<'static, ContextUpdate>, ContextError> {
        let pipeline = MessagePipeline::default();
        pipeline.process(self, &message)
    }

    pub fn stream_llm_response<I, S>(&mut self, chunks: I) -> BoxStream<'static, ContextUpdate>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let (message_id, mut updates) = self.begin_streaming_response();

        for chunk in chunks.into_iter() {
            if let Some((update, _sequence)) = self.apply_streaming_delta(message_id, chunk.into())
            {
                updates.push(update);
            }
        }

        updates.extend(self.finish_streaming_response(message_id));

        stream::iter(updates).boxed()
    }

    pub async fn stream_llm_response_from_events<S, E>(
        &mut self,
        mut events: S,
    ) -> Result<BoxStream<'static, ContextUpdate>, ContextError>
    where
        S: Stream<Item = Result<SseEvent, EventStreamError<E>>> + Unpin,
        E: std::fmt::Display,
    {
        let mut chunks = Vec::new();

        while let Some(event_result) = events.next().await {
            let event =
                event_result.map_err(|err| ContextError::StreamingError(err.to_string()))?;

            if event.data == "[DONE]" {
                break;
            }

            if !event.data.is_empty() {
                chunks.push(event.data.clone());
            }
        }

        Ok(self.stream_llm_response(chunks))
    }

    /// Transition to AwaitingLLMResponse state before sending request to LLM.
    /// This should be called before initiating the LLM API call.
    pub fn transition_to_awaiting_llm(&mut self) -> Vec<ContextUpdate> {
        let mut updates = Vec::new();

        // Only transition if we're in a valid state to make an LLM request
        if matches!(
            self.current_state,
            ContextState::ProcessingUserMessage
                | ContextState::ProcessingToolResults
                | ContextState::GeneratingResponse
                | ContextState::ToolAutoLoop { .. }
        ) {
            let previous_state = Some(self.current_state.clone());
            self.current_state = ContextState::AwaitingLLMResponse;
            updates.push(ContextUpdate {
                context_id: self.id,
                current_state: self.current_state.clone(),
                previous_state,
                message_update: None,
                timestamp: Utc::now(),
                metadata: HashMap::new(),
            });
        }

        updates
    }

    /// Handle an error that occurred during LLM request/response.
    /// Transitions to Failed state.
    pub fn handle_llm_error(&mut self, error_message: String) -> Vec<ContextUpdate> {
        let mut updates = Vec::new();

        let previous_state = Some(self.current_state.clone());
        self.current_state = ContextState::Failed {
            error: error_message,
        };
        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        updates
    }

    pub fn begin_streaming_response(&mut self) -> (Uuid, Vec<ContextUpdate>) {
        let mut updates = Vec::new();

        let previous_state = Some(self.current_state.clone());
        self.current_state = ContextState::StreamingLLMResponse;
        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        let branch_name = self.active_branch_name.clone();
        let assistant_message = InternalMessage {
            role: Role::Assistant,
            content: vec![ContentPart::text_owned(String::new())],
            message_type: MessageType::Text,
            ..Default::default()
        };
        let assistant_id = self.add_message_to_branch(&branch_name, assistant_message);

        self.stream_sequences.insert(assistant_id, 0);

        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state: None,
            message_update: Some(MessageUpdate::Created {
                message_id: assistant_id,
                role: Role::Assistant,
                message_type: MessageType::Text,
            }),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        (assistant_id, updates)
    }

    pub fn apply_streaming_delta<S>(
        &mut self,
        message_id: Uuid,
        delta: S,
    ) -> Option<(ContextUpdate, u64)>
    where
        S: Into<String>,
    {
        let delta = delta.into();
        if delta.is_empty() {
            return None;
        }

        if let Some(node) = self.message_pool.get_mut(&message_id) {
            match node.message.content.first_mut() {
                Some(ContentPart::Text { text }) => text.push_str(&delta),
                _ => {
                    node.message.content = vec![ContentPart::text_owned(delta.clone())];
                }
            }

            let accumulated = node
                .message
                .content
                .first()
                .and_then(|part| part.text_content())
                .unwrap_or_default()
                .to_string();

            let sequence = self.next_sequence(message_id);

            Some((
                ContextUpdate {
                    context_id: self.id,
                    current_state: self.current_state.clone(),
                    previous_state: None,
                    message_update: Some(MessageUpdate::ContentDelta {
                        message_id,
                        delta,
                        accumulated,
                    }),
                    timestamp: Utc::now(),
                    metadata: HashMap::new(),
                },
                sequence,
            ))
        } else {
            None
        }
    }

    pub fn finish_streaming_response(&mut self, message_id: Uuid) -> Vec<ContextUpdate> {
        let mut updates = Vec::new();

        let previous_state = self.current_state.clone();
        self.current_state = ContextState::ProcessingLLMResponse;

        if let Some(final_message) = self
            .message_pool
            .get(&message_id)
            .map(|node| node.message.clone())
        {
            updates.push(ContextUpdate {
                context_id: self.id,
                current_state: self.current_state.clone(),
                previous_state: Some(previous_state),
                message_update: Some(MessageUpdate::Completed {
                    message_id,
                    final_message,
                }),
                timestamp: Utc::now(),
                metadata: HashMap::new(),
            });
        }

        let previous_state = self.current_state.clone();
        self.current_state = ContextState::Idle;
        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state: Some(previous_state),
            message_update: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        updates
    }

    fn next_sequence(&mut self, message_id: Uuid) -> u64 {
        let seq_entry = self.stream_sequences.entry(message_id).or_insert(0);
        *seq_entry += 1;
        *seq_entry
    }

    pub fn ensure_sequence_at_least(&mut self, message_id: Uuid, minimum: u64) -> u64 {
        let seq_entry = self.stream_sequences.entry(message_id).or_insert(0);
        if *seq_entry < minimum {
            *seq_entry = minimum;
        }
        *seq_entry
    }

    pub fn message_sequence(&self, message_id: Uuid) -> Option<u64> {
        self.stream_sequences.get(&message_id).copied()
    }

    pub fn message_text_snapshot(&self, message_id: Uuid) -> Option<MessageTextSnapshot> {
        let node = self.message_pool.get(&message_id)?;
        let content = node
            .message
            .content
            .iter()
            .filter_map(|part| part.text_content())
            .collect::<Vec<_>>()
            .join("");
        let sequence = self.stream_sequences.get(&message_id).copied().unwrap_or(0);

        Some(MessageTextSnapshot {
            message_id,
            content,
            sequence,
        })
    }

    pub fn message_content_slice(
        &self,
        message_id: Uuid,
        from_sequence: Option<u64>,
    ) -> Option<MessageContentSlice> {
        let snapshot = self.message_text_snapshot(message_id)?;
        let from_seq = from_sequence.unwrap_or(0);
        let has_updates = snapshot.sequence > from_seq;
        let content = if has_updates {
            snapshot.content
        } else {
            String::new()
        };

        Some(MessageContentSlice {
            context_id: self.id,
            message_id,
            sequence: snapshot.sequence,
            content,
            has_updates,
        })
    }

    pub fn abort_streaming_response<S>(&mut self, message_id: Uuid, error: S) -> Vec<ContextUpdate>
    where
        S: Into<String>,
    {
        let error_message = error.into();
        let mut updates = Vec::new();

        let previous_state = self.current_state.clone();
        self.current_state = ContextState::Failed {
            error: error_message.clone(),
        };

        let mut metadata = HashMap::new();
        metadata.insert(
            "error".to_string(),
            serde_json::Value::String(error_message.clone()),
        );

        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state: Some(previous_state),
            message_update: Some(MessageUpdate::StatusChanged {
                message_id,
                old_status: "streaming".to_string(),
                new_status: "failed".to_string(),
            }),
            timestamp: Utc::now(),
            metadata,
        });

        updates
    }

    pub(crate) fn handle_text_message(
        &mut self,
        payload: &IncomingTextMessage,
    ) -> Result<BoxStream<'static, ContextUpdate>, ContextError> {
        if payload.content.trim().is_empty() {
            return Err(ContextError::EmptyMessageContent);
        }

        let mut updates = Vec::new();

        let previous_state = Some(self.current_state.clone());
        self.current_state = ContextState::ProcessingUserMessage;
        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        let mut user_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text_owned(payload.content.clone())],
            message_type: MessageType::Text,
            ..Default::default()
        };

        if let Some(metadata) = &payload.metadata {
            user_message.metadata = Some(metadata.clone());
        }

        if let Some(display_text) = &payload.display_text {
            let mut extra = user_message
                .metadata
                .as_ref()
                .and_then(|meta| meta.extra.clone())
                .unwrap_or_default();
            extra.insert("display_text".to_string(), json!(display_text));
            user_message
                .metadata
                .get_or_insert_with(MessageMetadata::default)
                .extra = Some(extra);
        }

        let branch_name = self.active_branch_name.clone();
        let message_id = self.add_message_to_branch(&branch_name, user_message.clone());

        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state: None,
            message_update: Some(MessageUpdate::Created {
                message_id,
                role: Role::User,
                message_type: MessageType::Text,
            }),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        let final_message = self
            .message_pool
            .get(&message_id)
            .map(|node| node.message.clone())
            .unwrap_or(user_message);

        let previous_state = self.current_state.clone();
        self.current_state = ContextState::Idle;

        updates.push(ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state: Some(previous_state),
            message_update: Some(MessageUpdate::Completed {
                message_id,
                final_message,
            }),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        });

        Ok(stream::iter(updates).boxed())
    }

    pub fn record_tool_approval_request(
        &mut self,
        request_id: Uuid,
        tool_name: &str,
    ) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolApprovalRequested {
            request_id,
            tool_name: tool_name.to_string(),
        });

        let (pending_requests, tool_names) = self.tool_execution.pending_snapshot();
        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("approval_requested"));
        metadata.insert("tool_name".to_string(), json!(tool_name));
        metadata.insert("request_id".to_string(), json!(request_id));
        metadata.insert(
            "pending_requests".to_string(),
            json!(
                pending_requests
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
            ),
        );
        metadata.insert("pending_tools".to_string(), json!(tool_names));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn append_text_message_with_metadata(
        &mut self,
        role: Role,
        message_type: MessageType,
        text: String,
        metadata: Option<MessageMetadata>,
        tool_result: Option<ToolCallResult>,
    ) -> (Uuid, u64) {
        let message = InternalMessage {
            role,
            content: vec![ContentPart::text_owned(text)],
            tool_result,
            metadata,
            message_type,
            ..Default::default()
        };

        let message_id = self.add_message_to_branch("main", message);
        let sequence = self.ensure_sequence_at_least(message_id, 1);

        self.handle_event(ChatEvent::LLMStreamEnded);
        self.handle_event(ChatEvent::LLMResponseProcessed {
            has_tool_calls: false,
        });

        (message_id, sequence)
    }

    pub fn record_tool_calls_denied(&mut self) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolCallsDenied);

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("approval_denied"));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn begin_auto_loop(&mut self, depth: u32) -> ContextUpdate {
        self.tool_execution.begin_auto_loop(depth);
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopStarted {
            depth,
            tools_executed: self.tool_execution.tools_executed(),
        });

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_started"));
        metadata.insert("depth".to_string(), json!(depth));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn record_auto_loop_progress(&mut self) -> ContextUpdate {
        self.tool_execution.increment_tools_executed();
        let depth = self.tool_execution.auto_loop_depth();
        let executed = self.tool_execution.tools_executed();
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopProgress {
            depth,
            tools_executed: executed,
        });

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_progress"));
        metadata.insert("depth".to_string(), json!(depth));
        metadata.insert("tools_executed".to_string(), json!(executed));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn complete_auto_loop(&mut self) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolAutoLoopFinished);

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("auto_loop_finished"));
        metadata.insert(
            "tools_executed".to_string(),
            json!(self.tool_execution.tools_executed()),
        );

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn begin_tool_execution(
        &mut self,
        tool_name: &str,
        attempt: u8,
        request_id: Option<Uuid>,
    ) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolExecutionStarted {
            tool_name: tool_name.to_string(),
            attempt,
            request_id,
        });

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("execution_started"));
        metadata.insert("tool_name".to_string(), json!(tool_name));
        metadata.insert("attempt".to_string(), json!(attempt));
        if let Some(id) = request_id {
            metadata.insert("request_id".to_string(), json!(id));
        }

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn record_tool_execution_failure(
        &mut self,
        tool_name: &str,
        retry_count: u8,
        error: &str,
        request_id: Option<Uuid>,
    ) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolExecutionFailed {
            tool_name: tool_name.to_string(),
            error: error.to_string(),
            retry_count,
            request_id,
        });

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("execution_failed"));
        metadata.insert("tool_name".to_string(), json!(tool_name));
        metadata.insert("retry_count".to_string(), json!(retry_count));
        metadata.insert("error".to_string(), json!(error));
        if let Some(id) = request_id {
            metadata.insert("request_id".to_string(), json!(id));
        }

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub fn complete_tool_execution(&mut self) -> ContextUpdate {
        let previous_state = Some(self.current_state.clone());
        self.handle_event(ChatEvent::ToolExecutionCompleted);

        let mut metadata = HashMap::new();
        metadata.insert("tool_event".to_string(), json!("execution_completed"));

        ContextUpdate {
            context_id: self.id,
            current_state: self.current_state.clone(),
            previous_state,
            message_update: None,
            timestamp: Utc::now(),
            metadata,
        }
    }

    pub async fn process_auto_tool_step<R: crate::traits::ToolRuntime + ?Sized>(
        &mut self,
        runtime: &R,
        tool_name: String,
        arguments: serde_json::Value,
        terminate: bool,
        request_id: Option<Uuid>,
    ) -> Result<Vec<ContextUpdate>, crate::error::ContextError> {
        use crate::traits::ToolRuntimeAction;

        let mut updates = Vec::new();

        updates.push(self.begin_auto_loop(self.tool_execution.auto_loop_depth() + 1));
        updates.push(self.begin_tool_execution(&tool_name, 1, request_id));

        match runtime
            .execute_tool(self.id, &tool_name, arguments.clone(), request_id)
            .await
        {
            Ok(result) => {
                updates.push(self.record_auto_loop_progress());

                let mut execution_update = self.complete_tool_execution();
                execution_update
                    .metadata
                    .insert("result".to_string(), result.clone());
                execution_update
                    .metadata
                    .insert("tool_name".to_string(), json!(tool_name));
                if let Some(req_id) = request_id {
                    execution_update
                        .metadata
                        .insert("request_id".to_string(), json!(req_id));
                }
                updates.push(execution_update);

                updates.push(self.complete_auto_loop());

                let message_text = format_tool_output(&result);
                let final_message = InternalMessage {
                    role: Role::Tool,
                    content: vec![ContentPart::text_owned(message_text.clone())],
                    tool_result: Some(ToolCallResult {
                        request_id: tool_name.clone(),
                        result,
                    }),
                    message_type: MessageType::ToolResult,
                    ..Default::default()
                };
                let message_id = self.add_message_to_branch("main", final_message.clone());
                let sequence = self.ensure_sequence_at_least(message_id, 1);

                let mut created_metadata = HashMap::new();
                created_metadata.insert("sequence".to_string(), json!(sequence));
                if let Some(req_id) = request_id {
                    created_metadata.insert("request_id".to_string(), json!(req_id));
                }

                updates.push(ContextUpdate {
                    context_id: self.id,
                    current_state: self.current_state.clone(),
                    previous_state: Some(self.current_state.clone()),
                    message_update: Some(MessageUpdate::Created {
                        message_id,
                        role: Role::Tool,
                        message_type: MessageType::ToolResult,
                    }),
                    timestamp: Utc::now(),
                    metadata: created_metadata,
                });
                let mut completed_metadata = HashMap::new();
                completed_metadata.insert("sequence".to_string(), json!(sequence));
                if let Some(req_id) = request_id {
                    completed_metadata.insert("request_id".to_string(), json!(req_id));
                }

                updates.push(ContextUpdate {
                    context_id: self.id,
                    current_state: self.current_state.clone(),
                    previous_state: Some(self.current_state.clone()),
                    message_update: Some(MessageUpdate::Completed {
                        message_id,
                        final_message,
                    }),
                    timestamp: Utc::now(),
                    metadata: completed_metadata,
                });

                let _ = runtime.notify_completion(self.id, &tool_name, true).await;
            }
            Err(ToolRuntimeAction::NeedsApproval) => {
                let info = runtime
                    .request_approval(self.id, &tool_name, arguments.clone(), terminate)
                    .await
                    .map_err(|err| match err {
                        ToolRuntimeAction::BackendError(_msg) => {
                            crate::error::ContextError::ToolExecutionRequired
                        }
                        _ => crate::error::ContextError::ToolExecutionRequired,
                    })?;

                let mut update = self.record_tool_approval_request(info.request_id, &tool_name);
                update
                    .metadata
                    .insert("tool_description".to_string(), json!(info.description));
                update
                    .metadata
                    .insert("parameters".to_string(), info.payload);
                updates.push(update);
            }
            Err(ToolRuntimeAction::ExecutionFailed(reason)) => {
                let mut failure_update =
                    self.record_tool_execution_failure(&tool_name, 0, &reason, request_id);
                failure_update
                    .metadata
                    .insert("tool_name".to_string(), json!(tool_name));
                updates.push(failure_update);
                updates.push(self.complete_auto_loop());

                let error_payload = json!({
                    "error": reason,
                    "tool": tool_name,
                });

                let error_text = format_tool_output(&error_payload);
                let final_message = InternalMessage {
                    role: Role::Tool,
                    content: vec![ContentPart::text_owned(error_text)],
                    tool_result: Some(ToolCallResult {
                        request_id: tool_name.clone(),
                        result: error_payload.clone(),
                    }),
                    message_type: MessageType::ToolResult,
                    ..Default::default()
                };
                let message_id = self.add_message_to_branch("main", final_message.clone());
                let sequence = self.ensure_sequence_at_least(message_id, 1);

                let mut created_metadata = HashMap::new();
                created_metadata.insert("sequence".to_string(), json!(sequence));
                if let Some(req_id) = request_id {
                    created_metadata.insert("request_id".to_string(), json!(req_id));
                }

                updates.push(ContextUpdate {
                    context_id: self.id,
                    current_state: self.current_state.clone(),
                    previous_state: Some(self.current_state.clone()),
                    message_update: Some(MessageUpdate::Created {
                        message_id,
                        role: Role::Tool,
                        message_type: MessageType::ToolResult,
                    }),
                    timestamp: Utc::now(),
                    metadata: created_metadata,
                });
                let mut completed_metadata = HashMap::new();
                completed_metadata.insert("sequence".to_string(), json!(sequence));
                if let Some(req_id) = request_id {
                    completed_metadata.insert("request_id".to_string(), json!(req_id));
                }

                updates.push(ContextUpdate {
                    context_id: self.id,
                    current_state: self.current_state.clone(),
                    previous_state: Some(self.current_state.clone()),
                    message_update: Some(MessageUpdate::Completed {
                        message_id,
                        final_message,
                    }),
                    timestamp: Utc::now(),
                    metadata: completed_metadata,
                });

                let _ = runtime.notify_completion(self.id, &tool_name, false).await;
            }
            Err(ToolRuntimeAction::BackendError(_reason)) => {
                return Err(crate::error::ContextError::ToolExecutionRequired);
            }
        }

        Ok(updates)
    }
}

pub struct StreamingResponseBuilder<'a> {
    context: &'a mut ChatContext,
}

impl<'a> StreamingResponseBuilder<'a> {
    pub fn new(context: &'a mut ChatContext) -> Self {
        Self { context }
    }

    pub fn build_with_chunks<I, S>(self, chunks: I) -> BoxStream<'static, ContextUpdate>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.context.stream_llm_response(chunks)
    }
}

// ============================================================================
// Phase 1.5.3: Rich Streaming Response Methods (using StreamingResponseMsg)
// ============================================================================

impl ChatContext {
    /// Begin a new streaming LLM response with rich chunk tracking (Phase 1.5.3)
    ///
    /// Returns the message ID of the newly created streaming response message.
    pub fn begin_streaming_llm_response(&mut self, model: Option<String>) -> Uuid {
        tracing::debug!(
            context_id = %self.id,
            model = ?model,
            "ChatContext: begin_streaming_llm_response - creating StreamingResponse message"
        );

        // Transition state
        let previous_state = self.current_state.clone();
        self.current_state = ContextState::StreamingLLMResponse;

        // Create a new StreamingResponseMsg
        let streaming_msg = StreamingResponseMsg::new(model);

        // Create internal message with rich type
        let mut metadata = MessageMetadata::default();
        metadata.source = Some(MessageSource::AIGenerated);
        metadata.created_at = Some(Utc::now());

        let assistant_message = InternalMessage {
            role: Role::Assistant,
            content: vec![], // Will be populated from streaming_msg.content
            message_type: MessageType::Text,
            rich_type: Some(RichMessageType::StreamingResponse(streaming_msg)),
            metadata: Some(metadata),
            ..Default::default()
        };

        // Add to active branch
        let branch_name = self.active_branch_name.clone();
        let message_id = self.add_message_to_branch(&branch_name, assistant_message);

        self.mark_dirty();

        tracing::info!(
            context_id = %self.id,
            message_id = %message_id,
            previous_state = ?previous_state,
            current_state = ?self.current_state,
            "ChatContext: streaming response started"
        );

        message_id
    }

    /// Append a chunk to an ongoing streaming response (Phase 1.5.3)
    ///
    /// Returns the sequence number of the appended chunk, or None if the message
    /// is not a StreamingResponse.
    pub fn append_streaming_chunk<S>(&mut self, message_id: Uuid, delta: S) -> Option<u64>
    where
        S: Into<String>,
    {
        let delta = delta.into();
        if delta.is_empty() {
            return None;
        }

        tracing::trace!(
            context_id = %self.id,
            message_id = %message_id,
            delta_len = delta.len(),
            "ChatContext: append_streaming_chunk"
        );

        let node = self.message_pool.get_mut(&message_id)?;

        // Extract StreamingResponseMsg from rich_type
        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &mut node.message.rich_type
        {
            let sequence = streaming_msg.append_chunk(delta.clone());
            let accumulated_chars = streaming_msg.content.len();
            let total_chunks = streaming_msg.chunks.len();

            // Also update the legacy content field for backward compatibility
            node.message.content = vec![ContentPart::text(&streaming_msg.content)];

            // Drop the mutable borrow before calling mark_dirty
            let _ = node;
            self.mark_dirty();

            tracing::debug!(
                context_id = %self.id,
                message_id = %message_id,
                sequence = sequence,
                accumulated_chars = accumulated_chars,
                total_chunks = total_chunks,
                "ChatContext: chunk appended"
            );

            Some(sequence)
        } else {
            tracing::warn!(
                context_id = %self.id,
                message_id = %message_id,
                "ChatContext: append_streaming_chunk called on non-StreamingResponse message"
            );
            None
        }
    }

    /// Finalize a streaming response and calculate statistics (Phase 1.5.3)
    ///
    /// Returns true if the message was successfully finalized.
    pub fn finalize_streaming_response(
        &mut self,
        message_id: Uuid,
        finish_reason: Option<String>,
        usage: Option<crate::structs::metadata::TokenUsage>,
    ) -> bool {
        tracing::debug!(
            context_id = %self.id,
            message_id = %message_id,
            finish_reason = ?finish_reason,
            "ChatContext: finalize_streaming_response"
        );

        let node = self.message_pool.get_mut(&message_id);
        if node.is_none() {
            tracing::warn!(
                context_id = %self.id,
                message_id = %message_id,
                "ChatContext: finalize_streaming_response - message not found"
            );
            return false;
        }

        let node = node.unwrap();

        // Finalize StreamingResponseMsg
        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &mut node.message.rich_type
        {
            streaming_msg.finalize(finish_reason, usage.clone());

            // Update metadata with streaming statistics
            let mut metadata = node.message.metadata.clone().unwrap_or_default();

            // Calculate average chunk interval
            let intervals: Vec<u64> = streaming_msg
                .chunks
                .iter()
                .filter_map(|c| c.interval_ms)
                .collect();
            let avg_interval = if !intervals.is_empty() {
                Some(intervals.iter().sum::<u64>() as f64 / intervals.len() as f64)
            } else {
                None
            };

            metadata.streaming = Some(StreamingMetadata {
                chunks_count: streaming_msg.chunks.len(),
                started_at: streaming_msg.started_at,
                completed_at: streaming_msg.completed_at,
                total_duration_ms: streaming_msg.total_duration_ms,
                average_chunk_interval_ms: avg_interval,
            });
            metadata.tokens = usage;
            node.message.metadata = Some(metadata);

            // Extract values for logging before dropping node
            let total_chunks = streaming_msg.chunks.len();
            let total_duration_ms = streaming_msg.total_duration_ms;
            let content_length = streaming_msg.content.len();

            // Transition state back to processing
            let previous_state = self.current_state.clone();
            self.current_state = ContextState::ProcessingLLMResponse;

            // Drop the mutable borrow before calling mark_dirty
            let _ = node;
            self.mark_dirty();

            tracing::info!(
                context_id = %self.id,
                message_id = %message_id,
                total_chunks = total_chunks,
                total_duration_ms = ?total_duration_ms,
                content_length = content_length,
                previous_state = ?previous_state,
                current_state = ?self.current_state,
                "ChatContext: streaming response finalized"
            );

            true
        } else {
            tracing::warn!(
                context_id = %self.id,
                message_id = %message_id,
                "ChatContext: finalize_streaming_response called on non-StreamingResponse message"
            );
            false
        }
    }

    /// Get the current sequence number of a streaming response (Phase 1.5.3)
    pub fn get_streaming_sequence(&self, message_id: Uuid) -> Option<u64> {
        let node = self.message_pool.get(&message_id)?;

        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
            Some(streaming_msg.current_sequence())
        } else {
            None
        }
    }

    /// Get chunks after a given sequence for incremental pull (Phase 1.5.3)
    pub fn get_streaming_chunks_after(
        &self,
        message_id: Uuid,
        after_sequence: u64,
    ) -> Option<Vec<(u64, String)>> {
        let node = self.message_pool.get(&message_id)?;

        if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
            let chunks = streaming_msg
                .chunks_after(after_sequence)
                .iter()
                .map(|chunk| (chunk.sequence, chunk.delta.clone()))
                .collect();
            Some(chunks)
        } else {
            None
        }
    }

    // ========================================================================
    // Phase 2.0: Message Processing Pipeline Integration
    // ========================================================================

    /// Build a message processing pipeline configured for this context
    ///
    /// The pipeline is built dynamically based on the context's configuration:
    /// - ValidationProcessor: Always included to validate incoming messages
    /// - FileReferenceProcessor: Included if workspace_path is configured
    /// - ToolEnhancementProcessor: Included to inject tool definitions
    /// - SystemPromptProcessor: Included to assemble the final system prompt
    fn build_message_pipeline(&self) -> crate::pipeline::pipeline::MessagePipeline {
        use crate::pipeline::pipeline::MessagePipeline;
        use crate::pipeline::processors::*;

        let mut pipeline = MessagePipeline::new();

        // 1. Validation (always first)
        pipeline = pipeline.register(Box::new(validation::ValidationProcessor::new()));

        // 2. File Reference Processing (if workspace is configured)
        if let Some(workspace_path) = &self.config.workspace_path {
            pipeline = pipeline.register(Box::new(file_reference::FileReferenceProcessor::new(
                workspace_path,
            )));
        }

        // 3. Tool Enhancement (inject tool definitions)
        // TODO: Phase 2.x - Get tools from ToolRegistry
        pipeline = pipeline.register(Box::new(tool_enhancement::ToolEnhancementProcessor::new()));

        // 4. System Prompt Assembly (always last)
        // TODO: Phase 2.x - Get actual system prompt content from SystemPromptService
        let base_prompt = "You are a helpful AI assistant.".to_string();
        pipeline = pipeline.register(Box::new(
            system_prompt::SystemPromptProcessor::with_base_prompt(base_prompt),
        ));

        pipeline
    }

    /// Process a text message through the new Pipeline architecture (Phase 2.0)
    ///
    /// This method:
    /// 1. Creates an InternalMessage from the incoming text
    /// 2. Runs it through the configured pipeline
    /// 3. Returns the processed message and metadata
    ///
    /// # Arguments
    /// * `payload` - The incoming text message to process
    ///
    /// # Returns
    /// * `Ok((InternalMessage, metadata))` - The processed message and its metadata
    /// * `Err(ContextError)` - If processing fails
    pub async fn process_message_with_pipeline(
        &mut self,
        payload: &IncomingTextMessage,
    ) -> Result<(InternalMessage, HashMap<String, serde_json::Value>), ContextError> {
        use crate::pipeline::result::PipelineOutput;

        // Create the internal message from the payload
        let mut internal_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text_owned(payload.content.clone())],
            message_type: MessageType::Text,
            rich_type: Some(RichMessageType::Text(
                crate::structs::message_types::TextMessage::new(payload.content.clone()),
            )),
            ..Default::default()
        };

        // Apply metadata if provided
        if let Some(metadata) = &payload.metadata {
            internal_message.metadata = Some(metadata.clone());
        }

        // Build and execute the pipeline
        let pipeline = self.build_message_pipeline();
        let output = pipeline
            .execute(internal_message, self)
            .await
            .map_err(|e| ContextError::PipelineError(format!("{:?}", e)))?;

        // Handle the pipeline output
        match output {
            PipelineOutput::Completed {
                message,
                metadata,
                stats,
            } => {
                tracing::info!(
                    context_id = %self.id,
                    processors_run = stats.processors_run,
                    duration_ms = stats.total_duration_ms,
                    "Pipeline completed successfully"
                );
                Ok((message, metadata))
            }
            PipelineOutput::Aborted {
                reason, aborted_by, ..
            } => {
                tracing::warn!(
                    context_id = %self.id,
                    reason = %reason,
                    aborted_by = %aborted_by,
                    "Pipeline aborted"
                );
                Err(ContextError::PipelineError(format!(
                    "Pipeline aborted by {}: {}",
                    aborted_by, reason
                )))
            }
            PipelineOutput::Suspended { reason, .. } => {
                tracing::warn!(
                    context_id = %self.id,
                    reason = %reason,
                    "Pipeline suspended"
                );
                Err(ContextError::PipelineError(format!(
                    "Pipeline suspended: {}",
                    reason
                )))
            }
        }
    }
}

fn format_tool_output(value: &serde_json::Value) -> String {
    if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
        return content.to_string();
    }

    if let Some(message) = value.get("message").and_then(|v| v.as_str()) {
        return message.to_string();
    }

    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}
