//! `context_manager` is a crate for robustly managing complex, multi-turn, 
//! and multi-branch conversations with LLMs.

// Declare the modules
pub mod structs;
pub mod traits;

// Re-export the public API
pub use structs::branch::{Branch, SystemPrompt};
pub use structs::context::{ChatContext, ChatConfig};
pub use structs::message::{ContentPart, InternalMessage, MessageNode, Role};
pub use structs::metadata::{MessageMetadata, TokenUsage};
pub use structs::tool::{ApprovalStatus, ToolCallRequest, ToolCallResult};
pub use traits::{Adapter, Enhancer};