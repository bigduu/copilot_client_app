use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Defines the possible states of a ChatContext's lifecycle.
///
/// This is a fine-grained state machine following Decision -1 in design.md,
/// where each micro-operation has an explicit state rather than using additional flags.
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

    /// Approved tool call is being executed.
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

    // ========== Legacy States (Keep for compatibility) ==========
    /// The context (with tool results or error feedback) is being sent to the LLM for a subsequent response.
    #[deprecated(note = "Use PreparingLLMRequest instead")]
    GeneratingResponse,

    /// Waiting for LLM connection.
    #[deprecated(note = "Use ConnectingToLLM instead")]
    ConnectingLLM,
}

impl Default for ContextState {
    fn default() -> Self {
        ContextState::Idle
    }
}
