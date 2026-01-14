//! State transitions - FSM transition logic
//!
//! Implements the state machine that handles event-driven state transitions.

use thiserror::Error;

use super::events::ChatEvent;
use super::states::ContextState;

/// Error type for invalid state transitions.
#[derive(Error, Debug, Clone)]
pub enum TransitionError {
    #[error("Invalid transition from {from:?} with event {event}")]
    InvalidTransition { from: ContextState, event: String },

    #[error("State machine is in terminal state: {0:?}")]
    TerminalState(ContextState),
}

/// Represents a state transition result.
#[derive(Debug, Clone)]
pub struct StateTransition {
    /// The state before the transition.
    pub from: ContextState,
    /// The state after the transition.
    pub to: ContextState,
    /// The event that triggered the transition.
    pub event: ChatEvent,
    /// Whether the state actually changed.
    pub changed: bool,
}

/// State machine for managing context state transitions.
#[derive(Debug, Clone)]
pub struct StateMachine {
    /// Current state.
    current_state: ContextState,
    /// Transition history (limited).
    history: Vec<StateTransition>,
    /// Max history entries to keep.
    max_history: usize,
}

impl Default for StateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl StateMachine {
    /// Create a new state machine in Idle state.
    pub fn new() -> Self {
        Self {
            current_state: ContextState::Idle,
            history: Vec::new(),
            max_history: 50,
        }
    }

    /// Create a state machine with a specific initial state.
    pub fn with_state(state: ContextState) -> Self {
        Self {
            current_state: state,
            history: Vec::new(),
            max_history: 50,
        }
    }

    /// Get the current state.
    pub fn state(&self) -> &ContextState {
        &self.current_state
    }

    /// Get the transition history.
    pub fn history(&self) -> &[StateTransition] {
        &self.history
    }

    /// Handle an event and transition to a new state.
    pub fn handle_event(&mut self, event: ChatEvent) -> StateTransition {
        let old_state = self.current_state.clone();
        let new_state = self.compute_next_state(&old_state, &event);
        let changed = old_state != new_state;

        self.current_state = new_state.clone();

        let transition = StateTransition {
            from: old_state,
            to: new_state,
            event,
            changed,
        };

        // Add to history
        self.history.push(transition.clone());
        if self.history.len() > self.max_history {
            self.history.remove(0);
        }

        transition
    }

    /// Compute the next state given current state and event.
    fn compute_next_state(&self, state: &ContextState, event: &ChatEvent) -> ContextState {
        use ChatEvent::*;
        use ContextState::*;

        match (state, event) {
            // ========== Idle Transitions ==========
            (Idle, UserMessageSent) => ProcessingUserMessage,

            // ========== Message Processing ==========
            (ProcessingUserMessage, LLMRequestInitiated) => AwaitingLLMResponse,

            // ========== LLM Interaction ==========
            (AwaitingLLMResponse, LLMStreamStarted) => StreamingLLMResponse,
            (AwaitingLLMResponse, LLMFullResponseReceived) => ProcessingLLMResponse,
            (AwaitingLLMResponse, FatalError { error }) => Failed {
                error_message: error.clone(),
                failed_at: chrono::Utc::now().to_rfc3339(),
            },

            (StreamingLLMResponse, LLMStreamChunkReceived) => StreamingLLMResponse,
            (StreamingLLMResponse, LLMStreamEnded) => ProcessingLLMResponse,
            (StreamingLLMResponse, FatalError { error }) => Failed {
                error_message: error.clone(),
                failed_at: chrono::Utc::now().to_rfc3339(),
            },

            // ========== LLM Response Processing ==========
            (
                ProcessingLLMResponse,
                LLMResponseProcessed {
                    has_todo_list: true,
                    ..
                },
            ) => CreatingTodoList,
            (
                ProcessingLLMResponse,
                LLMResponseProcessed {
                    has_tool_calls: true,
                    ..
                },
            ) => ParsingToolCalls,
            (
                ProcessingLLMResponse,
                LLMResponseProcessed {
                    has_tool_calls: false,
                    has_todo_list: false,
                },
            ) => Idle,

            // ========== TODO Execution (NEW) ==========
            (
                CreatingTodoList,
                TodoListCreated {
                    todo_list_id,
                    item_count,
                },
            ) => ExecutingTodoList {
                todo_list_id: *todo_list_id,
                current_item_index: 0,
                total_items: *item_count,
            },

            (
                ExecutingTodoList {
                    todo_list_id: _, ..
                },
                TodoItemStarted {
                    todo_item_id,
                    is_blocking,
                },
            ) => ExecutingTodoItem {
                todo_item_id: *todo_item_id,
                is_blocking: *is_blocking,
            },

            (ExecutingTodoItem { .. }, TodoItemCompleted { .. }) => {
                // Return to list processing
                ProcessingToolResults
            }

            (
                ExecutingTodoItem { .. },
                SubContextCreated {
                    parent_todo_item_id,
                    child_context_id,
                },
            ) => AwaitingSubContext {
                parent_todo_item_id: *parent_todo_item_id,
                child_context_id: *child_context_id,
            },

            (AwaitingSubContext { .. }, SubContextCompleted { .. }) => ProcessingToolResults,

            (ProcessingToolResults, TodoListCompleted { .. }) => Idle,

            // ========== Tool Approval ==========
            (
                ParsingToolCalls,
                ToolApprovalRequested {
                    request_id,
                    tool_name,
                },
            ) => AwaitingToolApproval {
                pending_requests: vec![*request_id],
                tool_names: vec![tool_name.clone()],
            },

            (
                AwaitingToolApproval {
                    pending_requests,
                    tool_names,
                },
                ToolApprovalRequested {
                    request_id,
                    tool_name,
                },
            ) => {
                let mut new_requests = pending_requests.clone();
                let mut new_names = tool_names.clone();
                new_requests.push(*request_id);
                new_names.push(tool_name.clone());
                AwaitingToolApproval {
                    pending_requests: new_requests,
                    tool_names: new_names,
                }
            }

            (
                AwaitingToolApproval { .. },
                ToolExecutionStarted {
                    tool_name, attempt, ..
                },
            ) => ExecutingTool {
                tool_name: tool_name.clone(),
                attempt: *attempt,
            },

            (AwaitingToolApproval { .. }, ToolCallsDenied) => Idle,

            // ========== Tool Execution ==========
            (ExecutingTool { .. }, ToolExecutionCompleted) => ProcessingToolResults,

            (
                ExecutingTool { .. },
                ToolExecutionFailed {
                    error, retry_count, ..
                },
            ) => TransientFailure {
                error_type: error.clone(),
                retry_count: *retry_count as usize,
                max_retries: 3,
            },

            (ExecutingTool { .. }, FatalError { error }) => Failed {
                error_message: error.clone(),
                failed_at: chrono::Utc::now().to_rfc3339(),
            },

            // ========== Tool Results ==========
            (ProcessingToolResults, LLMRequestInitiated) => AwaitingLLMResponse,

            (
                ProcessingToolResults,
                ToolAutoLoopStarted {
                    depth,
                    tools_executed,
                },
            ) => ToolAutoLoop {
                depth: *depth,
                tools_executed: *tools_executed,
            },

            // ========== Tool Auto Loop ==========
            (
                ToolAutoLoop { .. },
                ToolAutoLoopProgress {
                    depth,
                    tools_executed,
                },
            ) => ToolAutoLoop {
                depth: *depth,
                tools_executed: *tools_executed,
            },
            (ToolAutoLoop { .. }, ToolAutoLoopFinished) => ProcessingLLMResponse,
            (ToolAutoLoop { .. }, ToolAutoLoopCancelled) => Idle,
            (ToolAutoLoop { .. }, LLMRequestInitiated) => AwaitingLLMResponse,

            // ========== Error Recovery ==========
            (
                TransientFailure {
                    retry_count,
                    max_retries,
                    ..
                },
                Retry,
            ) if *retry_count < *max_retries => AwaitingLLMResponse,

            (TransientFailure { error_type, .. }, Retry) => Failed {
                error_message: format!("Max retries exceeded. Last error: {}", error_type),
                failed_at: chrono::Utc::now().to_rfc3339(),
            },

            // ========== User Actions ==========
            (_, UserCancelled) => Cancelling,
            (Cancelling, _) => Idle,
            (_, UserPaused) => Paused,
            (Paused, UserResumed) => Idle,

            // ========== Default: No transition ==========
            _ => state.clone(),
        }
    }

    /// Check if a transition is valid without executing it.
    pub fn can_transition(&self, event: &ChatEvent) -> bool {
        let next = self.compute_next_state(&self.current_state, event);
        next != self.current_state
    }

    /// Reset to Idle state.
    pub fn reset(&mut self) {
        self.current_state = ContextState::Idle;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_basic_flow() {
        let mut sm = StateMachine::new();
        assert_eq!(sm.state(), &ContextState::Idle);

        let t1 = sm.handle_event(ChatEvent::UserMessageSent);
        assert!(t1.changed);
        assert_eq!(sm.state(), &ContextState::ProcessingUserMessage);

        let t2 = sm.handle_event(ChatEvent::LLMRequestInitiated);
        assert!(t2.changed);
        assert_eq!(sm.state(), &ContextState::AwaitingLLMResponse);
    }

    #[test]
    fn test_todo_flow() {
        let mut sm = StateMachine::with_state(ContextState::ProcessingLLMResponse);

        let t1 = sm.handle_event(ChatEvent::LLMResponseProcessed {
            has_tool_calls: false,
            has_todo_list: true,
        });
        assert!(t1.changed);
        assert_eq!(sm.state(), &ContextState::CreatingTodoList);

        let list_id = Uuid::new_v4();
        let t2 = sm.handle_event(ChatEvent::TodoListCreated {
            todo_list_id: list_id,
            item_count: 3,
        });
        assert!(t2.changed);
        assert!(matches!(sm.state(), ContextState::ExecutingTodoList { .. }));
    }

    #[test]
    fn test_history_tracking() {
        let mut sm = StateMachine::new();
        sm.handle_event(ChatEvent::UserMessageSent);
        sm.handle_event(ChatEvent::LLMRequestInitiated);

        assert_eq!(sm.history().len(), 2);
    }
}
