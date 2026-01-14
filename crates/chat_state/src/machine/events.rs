//! Chat events - Defines events that trigger state transitions
//!
//! Enhanced with TODO-related events for the new architecture.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Defines the events that can trigger state transitions in the FSM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatEvent {
    // ========== User Events ==========
    /// User sent a new message.
    UserMessageSent,

    /// User cancelled the current operation.
    UserCancelled,

    /// User paused the operation.
    UserPaused,

    /// User resumed from pause.
    UserResumed,

    // ========== LLM Events ==========
    /// LLM request was initiated.
    LLMRequestInitiated,

    /// LLM stream started.
    LLMStreamStarted,

    /// LLM stream chunk received.
    LLMStreamChunkReceived,

    /// LLM stream ended.
    LLMStreamEnded,

    /// Full LLM response received (non-streaming).
    LLMFullResponseReceived,

    /// LLM response has been processed.
    LLMResponseProcessed {
        /// Whether the response contains tool calls.
        has_tool_calls: bool,
        /// Whether the response contains a TodoList.
        has_todo_list: bool,
    },

    // ========== TODO Events (NEW) ==========
    /// A TodoList was created from the LLM response.
    TodoListCreated {
        todo_list_id: Uuid,
        item_count: usize,
    },

    /// Started executing a TodoList.
    TodoListExecutionStarted { todo_list_id: Uuid },

    /// A TodoItem execution started.
    TodoItemStarted {
        todo_item_id: Uuid,
        is_blocking: bool,
    },

    /// A TodoItem execution completed.
    TodoItemCompleted { todo_item_id: Uuid },

    /// A TodoItem execution failed.
    TodoItemFailed { todo_item_id: Uuid, error: String },

    /// A SubContext was created.
    SubContextCreated {
        parent_todo_item_id: Uuid,
        child_context_id: Uuid,
    },

    /// A SubContext completed.
    SubContextCompleted { child_context_id: Uuid },

    /// TodoList execution completed (all items done).
    TodoListCompleted { todo_list_id: Uuid },

    // ========== Tool Events ==========
    /// Tool approval was requested.
    ToolApprovalRequested { request_id: Uuid, tool_name: String },

    /// Tool execution started.
    ToolExecutionStarted {
        tool_name: String,
        attempt: u8,
        request_id: Option<Uuid>,
    },

    /// Tool auto-loop started.
    ToolAutoLoopStarted { depth: u32, tools_executed: u32 },

    /// Tool auto-loop progress.
    ToolAutoLoopProgress { depth: u32, tools_executed: u32 },

    /// Tool auto-loop finished.
    ToolAutoLoopFinished,

    /// Tool auto-loop was cancelled.
    ToolAutoLoopCancelled,

    /// Tool calls were denied by user.
    ToolCallsDenied,

    /// Tool execution completed successfully.
    ToolExecutionCompleted,

    /// Tool execution failed.
    ToolExecutionFailed {
        tool_name: String,
        error: String,
        retry_count: u8,
        request_id: Option<Uuid>,
    },

    // ========== Error Events ==========
    /// Retry was requested.
    Retry,

    /// A fatal error occurred.
    FatalError { error: String },

    // ========== Storage Events ==========
    /// Context was saved.
    ContextSaved,

    /// Context was loaded.
    ContextLoaded,
}

impl ChatEvent {
    /// Check if this event is user-initiated.
    pub fn is_user_event(&self) -> bool {
        matches!(
            self,
            Self::UserMessageSent
                | Self::UserCancelled
                | Self::UserPaused
                | Self::UserResumed
                | Self::ToolCallsDenied
        )
    }

    /// Check if this is a TODO-related event.
    pub fn is_todo_event(&self) -> bool {
        matches!(
            self,
            Self::TodoListCreated { .. }
                | Self::TodoListExecutionStarted { .. }
                | Self::TodoItemStarted { .. }
                | Self::TodoItemCompleted { .. }
                | Self::TodoItemFailed { .. }
                | Self::SubContextCreated { .. }
                | Self::SubContextCompleted { .. }
                | Self::TodoListCompleted { .. }
        )
    }

    /// Check if this is an error event.
    pub fn is_error_event(&self) -> bool {
        matches!(
            self,
            Self::FatalError { .. }
                | Self::ToolExecutionFailed { .. }
                | Self::TodoItemFailed { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_event_detection() {
        assert!(ChatEvent::UserMessageSent.is_user_event());
        assert!(!ChatEvent::LLMStreamStarted.is_user_event());
    }

    #[test]
    fn test_todo_event_detection() {
        let event = ChatEvent::TodoListCreated {
            todo_list_id: Uuid::new_v4(),
            item_count: 3,
        };
        assert!(event.is_todo_event());
        assert!(!ChatEvent::UserMessageSent.is_todo_event());
    }
}
