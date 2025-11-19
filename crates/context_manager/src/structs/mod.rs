pub mod branch;
pub mod context;
pub mod context_agent;
pub mod context_branches;
pub mod context_lifecycle;
pub mod context_snapshot;
pub mod events;
pub mod llm_request;
pub mod message;
pub mod message_compat; // New: Backward compatibility layer
pub mod message_helpers; // New: Helper functions for message construction
pub mod message_types; // New: Rich internal message types
pub mod metadata;
pub mod state;
pub mod system_prompt_snapshot; // New: System prompt snapshot for debugging
pub mod tool;
