use crate::error::ContextError;
use crate::fsm::ChatEvent;
use crate::message_pipeline::MessagePipeline;
use crate::structs::context::ChatContext;
use crate::structs::events::{ContextUpdate, MessageUpdate};
use crate::structs::message::{
    ContentPart, IncomingMessage, IncomingTextMessage, InternalMessage, MessageType, Role,
};
use crate::structs::metadata::MessageMetadata;
use crate::structs::state::ContextState;
use chrono::Utc;
use futures::StreamExt;
use futures::stream::{self, BoxStream};
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
            if let Some(update) = self.apply_streaming_delta(message_id, chunk.into()) {
                updates.push(update);
            }
        }

        updates.extend(self.finish_streaming_response(message_id));

        stream::iter(updates).boxed()
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

    pub fn apply_streaming_delta<S>(&mut self, message_id: Uuid, delta: S) -> Option<ContextUpdate>
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

            Some(ContextUpdate {
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
            })
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

        if let Some(display_text) = &payload.display_text {
            let mut extra = HashMap::new();
            extra.insert("display_text".to_string(), json!(display_text));
            user_message.metadata = Some(MessageMetadata {
                extra: Some(extra),
                ..Default::default()
            });
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
