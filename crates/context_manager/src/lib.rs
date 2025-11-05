//! `context_manager` is a crate for robustly managing complex, multi-turn,
//! and multi-branch conversations with LLMs.

// Declare the modules
pub mod fsm;
pub mod structs;
pub mod traits;

// Re-export the public API
pub use fsm::ChatEvent;
pub use structs::branch::{Branch, SystemPrompt};
pub use structs::context::{ChatConfig, ChatContext};
pub use structs::message::{ContentPart, InternalMessage, MessageNode, Role};
pub use structs::metadata::{MessageMetadata, TokenUsage};
pub use structs::state::ContextState;
pub use structs::tool::{ApprovalStatus, DisplayPreference, ToolCallRequest, ToolCallResult};
pub use traits::{Adapter, Enhancer};
