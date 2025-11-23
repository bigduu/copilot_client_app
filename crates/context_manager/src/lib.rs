//! `context_manager` is a crate for robustly managing complex, multi-turn,
//! and multi-branch conversations with LLMs.

// Declare the modules
pub mod error;
pub mod fsm;
pub mod message_pipeline;
pub mod pipeline; // New pipeline system
pub mod structs;
pub mod traits;

// Re-export the public API
pub use error::ContextError;
pub use fsm::ChatEvent;
pub use message_pipeline::{MessagePipeline, MessageProcessor, ProcessResult};
pub use structs::branch::{Branch, SystemPrompt};
pub use structs::context::{ChatConfig, ChatContext};
pub use structs::context_agent::{AgentRole, Permission};

pub use structs::context_snapshot::{BranchSnapshot, LlmContextSnapshot};
pub use structs::events::{ContextUpdate, MessageUpdate};
pub use structs::llm_request::PreparedLlmRequest;
pub use structs::message::{
    ContentPart, IncomingMessage, IncomingTextMessage, InternalMessage, MessageContentSlice,
    MessageNode, MessageTextSnapshot, MessageType, Role,
};
pub use structs::message_types::{RichMessageType, StreamChunk, StreamingResponseMsg};
pub use structs::metadata::{
    DisplayHint, MessageMetadata, MessageSource, StreamingMetadata, TokenUsage,
};
pub use structs::state::ContextState;
pub use structs::tool::{
    ApprovalStatus, CurrentToolExecution, DisplayPreference, PendingToolRequest,
    ToolApprovalPolicy, ToolCallRequest, ToolCallResult, ToolExecutionContext, ToolSafetyConfig,
    ToolTimeoutConfig,
};
pub use traits::{Adapter, ApprovalRequestInfo, Enhancer, ToolRuntime, ToolRuntimeAction};
