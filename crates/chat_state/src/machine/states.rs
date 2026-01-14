//! Context states - Defines all possible states of a chat context
//!
//! Enhanced with TODO-aware states for the new architecture.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Defines the possible states of a ChatContext's lifecycle.
///
/// This is a fine-grained state machine where each micro-operation
/// has an explicit state rather than using additional flags.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextState {
    // ========== Idle and Preparation ==========
    /// The context is idle, awaiting user input.
    Idle,

    // ========== Message Processing Phase ==========
    /// The system is processing a new user message (validation, parsing).
    ProcessingUserMessage,

    /// Resolving file references (reading file content).
    ResolvingFileReferences,

    /// Enhancing System Prompt (injecting tool definitions, context).
    EnhancingSystemPrompt,

    /// Optimizing context (token counting, compression).
    OptimizingContext,

    // ========== LLM Interaction Phase ==========
    /// Preparing to send request to LLM.
    PreparingLLMRequest,

    /// Waiting for LLM connection to establish.
    ConnectingToLLM,

    /// Waiting for LLM first response chunk.
    AwaitingLLMResponse,

    /// Actively receiving LLM streaming response.
    StreamingLLMResponse,

    /// LLM response received completely, now processing.
    ProcessingLLMResponse,

    // ========== TODO Execution Phase (NEW) ==========
    /// Creating a new TodoList from LLM response.
    CreatingTodoList,

    /// Executing TodoItems (parent state).
    ExecutingTodoList {
        /// ID of the TodoList being executed.
        todo_list_id: Uuid,
        /// Current item index being executed.
        current_item_index: usize,
        /// Total items in the list.
        total_items: usize,
    },

    /// Executing a specific TodoItem.
    ExecutingTodoItem {
        /// ID of the TodoItem being executed.
        todo_item_id: Uuid,
        /// Type of execution (blocking or streaming).
        is_blocking: bool,
    },

    /// Waiting for SubContext to complete.
    AwaitingSubContext {
        /// ID of the parent TodoItem that spawned the SubContext.
        parent_todo_item_id: Uuid,
        /// ID of the child context.
        child_context_id: Uuid,
    },

    // ========== Tool Calling Phase ==========
    /// Parsing tool call requests.
    ParsingToolCalls,

    /// The LLM has requested tool calls that require user approval.
    AwaitingToolApproval {
        /// Pending approval request identifiers.
        pending_requests: Vec<Uuid>,
        /// Human readable tool names awaiting approval.
        tool_names: Vec<String>,
    },

    /// Approved tool call is being executed (blocking).
    ExecutingTool {
        /// The tool currently being executed.
        tool_name: String,
        /// The current attempt (1-based) for this tool execution.
        attempt: u8,
    },

    /// Collecting tool execution results.
    CollectingToolResults,

    /// Processing tool results (formatting, validation).
    ProcessingToolResults,

    /// The context is automatically looping through tool execution cycles.
    ToolAutoLoop {
        /// Current auto-loop depth (starts at 1 for the first iteration).
        depth: u32,
        /// Total number of tools executed during the current auto-loop session.
        tools_executed: u32,
    },

    // ========== Branch Operations Phase ==========
    /// Switching between branches.
    SwitchingBranch { from: String, to: String },

    /// Merging branches.
    MergingBranches {
        source: String,
        target: String,
        strategy: String, // "Append" | "CherryPick" | "Rebase"
    },

    // ========== Storage Operations Phase ==========
    /// Saving Context to storage.
    SavingContext,

    /// Saving a single message.
    SavingMessage { message_id: String },

    /// Loading historical messages.
    LoadingMessages { loaded: usize, total: usize },

    // ========== Optimization Phase ==========
    /// Compressing historical messages.
    CompressingMessages { messages_to_compress: usize },

    /// Generating message summary (calling LLM).
    GeneratingSummary,

    // ========== Error and Recovery ==========
    /// Transient error (retriable).
    TransientFailure {
        error_type: String,
        retry_count: usize,
        max_retries: usize,
    },

    /// Waiting for error recovery.
    WaitingForRecovery,

    /// Unrecoverable error (terminal state).
    Failed {
        error_message: String,
        failed_at: String, // ISO timestamp
    },

    // ========== Special States ==========
    /// Initializing (first creation).
    Initializing,

    /// Paused state (user requested pause).
    Paused,

    /// Cancelling current operation.
    Cancelling,
}

impl Default for ContextState {
    fn default() -> Self {
        ContextState::Idle
    }
}

impl ContextState {
    /// Check if this is a terminal state (no more transitions expected).
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Failed { .. } | Self::Idle)
    }

    /// Check if this state allows user input.
    pub fn accepts_user_input(&self) -> bool {
        matches!(
            self,
            Self::Idle | Self::AwaitingToolApproval { .. } | Self::Paused
        )
    }

    /// Check if this is a TODO-related state.
    pub fn is_todo_state(&self) -> bool {
        matches!(
            self,
            Self::CreatingTodoList
                | Self::ExecutingTodoList { .. }
                | Self::ExecutingTodoItem { .. }
                | Self::AwaitingSubContext { .. }
        )
    }

    /// Check if this state is blocking (waiting for something).
    pub fn is_blocking(&self) -> bool {
        matches!(
            self,
            Self::AwaitingLLMResponse
                | Self::AwaitingToolApproval { .. }
                | Self::AwaitingSubContext { .. }
                | Self::ExecutingTool { .. }
                | Self::ExecutingTodoItem {
                    is_blocking: true,
                    ..
                }
        )
    }

    /// Get a human-readable description of the current state.
    pub fn description(&self) -> &str {
        match self {
            Self::Idle => "Ready for input",
            Self::ProcessingUserMessage => "Processing your message",
            Self::AwaitingLLMResponse => "Waiting for AI response",
            Self::StreamingLLMResponse => "Receiving AI response",
            Self::ExecutingTodoList { .. } => "Executing tasks",
            Self::ExecutingTodoItem { .. } => "Running task",
            Self::ExecutingTool { .. } => "Running tool",
            Self::AwaitingToolApproval { .. } => "Waiting for approval",
            Self::AwaitingSubContext { .. } => "Running sub-task",
            Self::Failed { .. } => "Failed",
            _ => "Processing",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_state_is_idle() {
        assert_eq!(ContextState::default(), ContextState::Idle);
    }

    #[test]
    fn test_todo_state_detection() {
        let state = ContextState::ExecutingTodoList {
            todo_list_id: Uuid::new_v4(),
            current_item_index: 0,
            total_items: 5,
        };
        assert!(state.is_todo_state());
        assert!(!ContextState::Idle.is_todo_state());
    }

    #[test]
    fn test_blocking_state_detection() {
        let blocking = ContextState::ExecutingTodoItem {
            todo_item_id: Uuid::new_v4(),
            is_blocking: true,
        };
        let streaming = ContextState::ExecutingTodoItem {
            todo_item_id: Uuid::new_v4(),
            is_blocking: false,
        };
        assert!(blocking.is_blocking());
        assert!(!streaming.is_blocking());
    }
}
