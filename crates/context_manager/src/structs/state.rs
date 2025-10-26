use serde::{Deserialize, Serialize};

/// Defines the possible states of a ChatContext's lifecycle.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ContextState {
    /// The context is idle, awaiting user input.
    Idle,
    /// The system is processing a new user message before sending it to the LLM.
    ProcessingUserMessage,
    /// The system is awaiting or actively receiving a response from the LLM (unified state for streaming/non-streaming).
    AwaitingLLMResponse,
    /// The complete LLM response has been received and is being inspected for next steps (tool calls, final answer).
    ProcessingLLMResponse,
    /// The LLM has requested tool calls that require user approval.
    AwaitingToolApproval,
    /// Approved tool calls are being executed.
    ExecutingTools,
    /// The results of tool execution are being processed and added to the context.
    ProcessingToolResults,
    /// The LLM has returned an invalid tool call, and the system is preparing feedback for the model.
    HandlingToolError { tool_name: String, error: String },
    /// The context (with tool results or error feedback) is being sent to the LLM for a subsequent response.
    GeneratingResponse,
    /// A recoverable error occurred. The system will attempt to retry.
    TransientFailure { error: String, retry_count: u8 },
    /// A terminal, unrecoverable error has occurred.
    Failed { error: String },
}

impl Default for ContextState {
    fn default() -> Self {
        ContextState::Idle
    }
}