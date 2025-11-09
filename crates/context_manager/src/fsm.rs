use crate::{ChatContext, ContextState};
use uuid::Uuid;

/// Defines the events that can trigger state transitions in the ChatContext FSM.
#[derive(Debug)]
pub enum ChatEvent {
    UserMessageSent,
    LLMRequestInitiated,
    LLMStreamStarted,
    LLMStreamChunkReceived,
    LLMStreamEnded,
    LLMFullResponseReceived,
    LLMResponseProcessed {
        has_tool_calls: bool,
    },
    ToolApprovalRequested {
        request_id: Uuid,
        tool_name: String,
    },
    ToolExecutionStarted {
        tool_name: String,
        attempt: u8,
        request_id: Option<Uuid>,
    },
    ToolAutoLoopStarted {
        depth: u32,
        tools_executed: u32,
    },
    ToolAutoLoopProgress {
        depth: u32,
        tools_executed: u32,
    },
    ToolAutoLoopFinished,
    ToolCallsDenied,
    ToolExecutionCompleted,
    ToolExecutionFailed {
        tool_name: String,
        error: String,
        retry_count: u8,
        request_id: Option<Uuid>,
    },
    Retry,
    FatalError {
        error: String,
    },
}

impl ChatContext {
    /// Handles an event and transitions the context to a new state.
    pub fn handle_event(&mut self, event: ChatEvent) {
        tracing::debug!(
            context_id = %self.id,
            current_state = ?self.current_state,
            event = ?event,
            "FSM: handle_event called"
        );

        let old_state = self.current_state.clone();
        let new_state = match (&self.current_state, event) {
            (ContextState::Idle, ChatEvent::UserMessageSent) => ContextState::ProcessingUserMessage,
            (ContextState::ProcessingUserMessage, ChatEvent::LLMRequestInitiated) => {
                ContextState::AwaitingLLMResponse
            }
            (ContextState::AwaitingLLMResponse, ChatEvent::LLMStreamStarted) => {
                ContextState::StreamingLLMResponse
            }
            (ContextState::AwaitingLLMResponse, ChatEvent::LLMFullResponseReceived) => {
                ContextState::ProcessingLLMResponse
            }
            (ContextState::AwaitingLLMResponse, ChatEvent::FatalError { error }) => {
                ContextState::Failed { error }
            }
            (
                ContextState::AwaitingLLMResponse,
                ChatEvent::ToolExecutionFailed {
                    tool_name: _,
                    error,
                    retry_count,
                    request_id: _,
                },
            ) => ContextState::TransientFailure { error, retry_count },

            (ContextState::StreamingLLMResponse, ChatEvent::LLMStreamChunkReceived) => {
                ContextState::StreamingLLMResponse
            }
            (ContextState::StreamingLLMResponse, ChatEvent::LLMStreamEnded) => {
                ContextState::ProcessingLLMResponse
            }
            (ContextState::StreamingLLMResponse, ChatEvent::FatalError { error }) => {
                ContextState::Failed { error }
            }
            (
                ContextState::StreamingLLMResponse,
                ChatEvent::ToolExecutionFailed {
                    tool_name: _,
                    error,
                    retry_count,
                    request_id: _,
                },
            ) => ContextState::TransientFailure { error, retry_count },

            (
                ContextState::ProcessingLLMResponse,
                ChatEvent::LLMResponseProcessed {
                    has_tool_calls: true,
                },
            ) => {
                self.tool_execution.reset();
                let (pending_requests, tool_names) = self.tool_execution.pending_snapshot();
                ContextState::AwaitingToolApproval {
                    pending_requests,
                    tool_names,
                }
            }
            (
                ContextState::ProcessingLLMResponse,
                ChatEvent::LLMResponseProcessed {
                    has_tool_calls: false,
                },
            ) => {
                self.tool_execution.reset();
                ContextState::Idle
            }

            (
                ContextState::ProcessingLLMResponse,
                ChatEvent::ToolApprovalRequested {
                    request_id,
                    tool_name,
                },
            ) => {
                self.tool_execution
                    .add_pending(request_id, tool_name.clone());
                let (pending_requests, tool_names) = self.tool_execution.pending_snapshot();
                ContextState::AwaitingToolApproval {
                    pending_requests,
                    tool_names,
                }
            }
            (
                ContextState::AwaitingToolApproval { .. },
                ChatEvent::ToolApprovalRequested {
                    request_id,
                    tool_name,
                },
            ) => {
                self.tool_execution
                    .add_pending(request_id, tool_name.clone());
                let (pending_requests, tool_names) = self.tool_execution.pending_snapshot();
                ContextState::AwaitingToolApproval {
                    pending_requests,
                    tool_names,
                }
            }
            (
                ContextState::AwaitingToolApproval { .. },
                ChatEvent::ToolExecutionStarted {
                    tool_name,
                    attempt,
                    request_id,
                },
            ) => {
                self.tool_execution
                    .start_execution(tool_name.clone(), attempt, request_id);
                if let Some(current) = self.tool_execution.current() {
                    ContextState::ExecutingTool {
                        tool_name: current.tool_name.clone(),
                        attempt: current.attempt,
                    }
                } else {
                    ContextState::ExecutingTool { tool_name, attempt }
                }
            }
            (
                ContextState::ProcessingLLMResponse,
                ChatEvent::ToolExecutionStarted {
                    tool_name,
                    attempt,
                    request_id,
                },
            ) => {
                self.tool_execution
                    .start_execution(tool_name.clone(), attempt, request_id);
                ContextState::ExecutingTool { tool_name, attempt }
            }
            (
                ContextState::TransientFailure { .. },
                ChatEvent::ToolExecutionStarted {
                    tool_name,
                    attempt,
                    request_id,
                },
            ) => {
                self.tool_execution
                    .start_execution(tool_name.clone(), attempt, request_id);
                ContextState::ExecutingTool { tool_name, attempt }
            }
            (ContextState::AwaitingToolApproval { .. }, ChatEvent::ToolCallsDenied) => {
                self.tool_execution.reset();
                ContextState::GeneratingResponse
            }

            (ContextState::ExecutingTool { .. }, ChatEvent::ToolExecutionCompleted) => {
                self.tool_execution.complete_execution();
                ContextState::ProcessingToolResults
            }
            (
                ContextState::ExecutingTool { .. },
                ChatEvent::ToolExecutionFailed {
                    tool_name: _,
                    error,
                    retry_count,
                    request_id: _,
                },
            ) => ContextState::TransientFailure { error, retry_count },
            (ContextState::ExecutingTool { .. }, ChatEvent::FatalError { error }) => {
                ContextState::Failed { error }
            }

            (ContextState::ProcessingToolResults, ChatEvent::LLMRequestInitiated) => {
                ContextState::GeneratingResponse
            }
            (ContextState::GeneratingResponse, ChatEvent::LLMRequestInitiated) => {
                ContextState::AwaitingLLMResponse
            }
            (
                ContextState::ProcessingToolResults,
                ChatEvent::LLMResponseProcessed {
                    has_tool_calls: false,
                },
            ) => ContextState::Idle,
            (
                ContextState::ProcessingToolResults,
                ChatEvent::ToolAutoLoopStarted {
                    depth,
                    tools_executed,
                },
            ) => ContextState::ToolAutoLoop {
                depth,
                tools_executed,
            },

            (
                ContextState::ToolAutoLoop { .. },
                ChatEvent::ToolAutoLoopProgress {
                    depth,
                    tools_executed,
                },
            ) => ContextState::ToolAutoLoop {
                depth,
                tools_executed,
            },
            (ContextState::ToolAutoLoop { .. }, ChatEvent::ToolAutoLoopFinished) => {
                ContextState::GeneratingResponse
            }
            (ContextState::ToolAutoLoop { .. }, ChatEvent::LLMRequestInitiated) => {
                ContextState::AwaitingLLMResponse
            }

            (ContextState::TransientFailure { retry_count, .. }, ChatEvent::Retry)
                if *retry_count < 3 =>
            {
                ContextState::AwaitingLLMResponse
            }
            (ContextState::TransientFailure { error, .. }, ChatEvent::Retry) => {
                ContextState::Failed {
                    error: format!("Max retries exceeded. Last error: {}", error),
                }
            }

            // Default case: remain in the current state if the event is not applicable
            _ => {
                tracing::debug!(
                    context_id = %self.id,
                    current_state = ?self.current_state,
                    event = "unhandled",
                    "FSM: Event does not trigger state change"
                );
                self.current_state.clone()
            }
        };

        if old_state != new_state {
            tracing::info!(
                context_id = %self.id,
                old_state = ?old_state,
                new_state = ?new_state,
                "FSM: State transition"
            );
        } else {
            tracing::debug!(
                context_id = %self.id,
                state = ?self.current_state,
                "FSM: State unchanged"
            );
        }

        self.current_state = new_state;
    }
}
