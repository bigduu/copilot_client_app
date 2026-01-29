//! chat_core - Core types and traits for the chat system
//!
//! This crate provides the foundational types used across all chat-related crates:
//! - `config` - Global backend configuration
//! - `todo` - TodoItem, TodoList for task tracking

pub mod config;
pub mod keyword_masking;
pub mod todo;

// Re-export commonly used types
pub use config::{Config, ProxyAuth};
pub use keyword_masking::{KeywordEntry, KeywordMaskingConfig, MatchType};
pub use todo::{TodoExecution, TodoItem, TodoItemType, TodoList, TodoListStatus, TodoStatus};
