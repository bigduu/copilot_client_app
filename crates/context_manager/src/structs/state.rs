use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Defines the possible states of a ChatContext's lifecycle.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextState {
    /// The context is idle, awaiting user input.
    Idle,
    /// The system is processing a new user message before sending it to the LLM.
    ProcessingUserMessage,
    /// The system is awaiting a response from the LLM.
    AwaitingLLMResponse,
    /// The system is actively receiving and processing a stream of response chunks from the LLM.
    StreamingLLMResponse,
    /// The complete LLM response has been received and is being inspected for next steps (tool calls, final answer).
    ProcessingLLMResponse,
    /// The LLM has requested tool calls that require user approval.
    AwaitingToolApproval {
        /// Pending approval request identifiers.
        pending_requests: Vec<Uuid>,
        /// Human readable tool names awaiting approval.
        tool_names: Vec<String>,
    },
    /// Approved tool call is being executed.
    ExecutingTool {
        /// The tool currently being executed.
        tool_name: String,
        /// The current attempt (1-based) for this tool execution.
        attempt: u8,
    },
    /// The results of tool execution are being processed and added to the context.
    ProcessingToolResults,
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
