//! chat_core - Core types and traits for the chat system
//!
//! This crate provides the foundational types used across all chat-related crates:
//! - `todo` - TodoItem, TodoList for task tracking
//! - `agent` - AgentRole, SubTaskScope for permissions
//! - `context` - ContextTree for parent-child relationships
//! - `message` - Message content types

pub mod agent;
pub mod context;
pub mod message;
pub mod todo;

// Re-export commonly used types
pub use agent::{AgentRole, Permission, SubTaskScope};
pub use context::{ChildContextRef, ContextTree, MAX_CONTEXT_DEPTH};
pub use message::{ContentPart, MessageContent};
pub use todo::{TodoExecution, TodoItem, TodoItemType, TodoList, TodoListStatus, TodoStatus};
