//! State management and FSM transitions for ChatContext
//!
//! This module handles:
//! - Dirty flag management (for persistence)
//! - Trace ID management (for debugging)
//! - FSM state transitions
//! - Tool execution lifecycle
//! - Message handling

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
use crate::structs::tool::ToolCallResult;
use chrono::Utc;
use futures::StreamExt;
use futures::stream::{self, BoxStream};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

impl ChatContext {
    // ============================================================================
    // Dirty Flag Management
    // ============================================================================

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

    // ============================================================================
    // Trace ID Management
    // ============================================================================

    pub fn set_trace_id(&mut self, trace_id: String) {
        self.trace_id = Some(trace_id);
    }

    pub fn get_trace_id(&self) -> Option<&str> {
        self.trace_id.as_deref()
    }

    pub fn clear_trace_id(&mut self) {
        self.trace_id = None;
    }

    // ============================================================================
    // FSM State Transitions
    // ============================================================================

    /// Transition to AwaitingLLMResponse state before sending request to LLM.
    /// This should be called before initiating the LLM API call.
    pub fn transition_to_awaiting_llm(&mut self) -> Vec<ContextUpdate> {
        let mut updates = Vec::new();

        // Only transition if we're in a valid state to make an LLM request
        #[allow(deprecated)]
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
            error_message,
            failed_at: chrono::Utc::now().to_rfc3339(),
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

    // ============================================================================
    // Tool Execution Lifecycle
    // ============================================================================

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

    // ============================================================================
    // Message Handling (Legacy)
    // ============================================================================

    pub fn send_message(
        &mut self,
        message: IncomingMessage,
    ) -> Result<BoxStream<'static, ContextUpdate>, ContextError> {
        let pipeline = MessagePipeline::default();
        pipeline.process(self, &message)
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
}
