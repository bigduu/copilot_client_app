use crate::{ChatContext, ContextState};

/// Defines the events that can trigger state transitions in the ChatContext FSM.
pub enum ChatEvent {
    UserMessageSent,
    LLMRequestInitiated,
    LLMStreamStarted,
    LLMStreamChunkReceived,
    LLMStreamEnded,
    LLMFullResponseReceived,
    LLMResponseProcessed { has_tool_calls: bool },
    ToolCallsApproved,
    ToolCallsDenied,
    ToolExecutionCompleted,
    ToolExecutionFailed { error: String, retry_count: u8 },
    Retry,
    FatalError { error: String },
}

impl ChatContext {
    /// Handles an event and transitions the context to a new state.
    pub fn handle_event(&mut self, event: ChatEvent) {
        let new_state = match (&self.current_state, event) {
            (ContextState::Idle, ChatEvent::UserMessageSent) => ContextState::ProcessingUserMessage,
            (ContextState::ProcessingUserMessage, ChatEvent::LLMRequestInitiated) => ContextState::AwaitingLLMResponse,
            (ContextState::AwaitingLLMResponse, ChatEvent::LLMStreamStarted) => ContextState::StreamingLLMResponse,
            (ContextState::AwaitingLLMResponse, ChatEvent::LLMFullResponseReceived) => ContextState::ProcessingLLMResponse,
            (ContextState::AwaitingLLMResponse, ChatEvent::FatalError { error }) => ContextState::Failed { error },
            (ContextState::AwaitingLLMResponse, ChatEvent::ToolExecutionFailed { error, retry_count }) => ContextState::TransientFailure { error, retry_count },

            (ContextState::StreamingLLMResponse, ChatEvent::LLMStreamChunkReceived) => ContextState::StreamingLLMResponse,
            (ContextState::StreamingLLMResponse, ChatEvent::LLMStreamEnded) => ContextState::ProcessingLLMResponse,
            (ContextState::StreamingLLMResponse, ChatEvent::FatalError { error }) => ContextState::Failed { error },
            (ContextState::StreamingLLMResponse, ChatEvent::ToolExecutionFailed { error, retry_count }) => ContextState::TransientFailure { error, retry_count },

            (ContextState::ProcessingLLMResponse, ChatEvent::LLMResponseProcessed { has_tool_calls: true }) => ContextState::AwaitingToolApproval,
            (ContextState::ProcessingLLMResponse, ChatEvent::LLMResponseProcessed { has_tool_calls: false }) => ContextState::Idle,

            (ContextState::AwaitingToolApproval, ChatEvent::ToolCallsApproved) => ContextState::ExecutingTools,
            (ContextState::AwaitingToolApproval, ChatEvent::ToolCallsDenied) => ContextState::GeneratingResponse,

            (ContextState::ExecutingTools, ChatEvent::ToolExecutionCompleted) => ContextState::ProcessingToolResults,
            (ContextState::ExecutingTools, ChatEvent::ToolExecutionFailed { error, retry_count }) => ContextState::TransientFailure { error, retry_count },
            (ContextState::ExecutingTools, ChatEvent::FatalError { error }) => ContextState::Failed { error },

            (ContextState::ProcessingToolResults, ChatEvent::LLMRequestInitiated) => ContextState::GeneratingResponse,
            (ContextState::GeneratingResponse, ChatEvent::LLMRequestInitiated) => ContextState::AwaitingLLMResponse,

            (ContextState::TransientFailure { retry_count, .. }, ChatEvent::Retry) if *retry_count < 3 => ContextState::AwaitingLLMResponse,
            (ContextState::TransientFailure { error, .. }, ChatEvent::Retry) => ContextState::Failed { error: format!("Max retries exceeded. Last error: {}", error) },

            // Default case: remain in the current state if the event is not applicable
            _ => self.current_state.clone(),
        };
        self.current_state = new_state;
    }
}