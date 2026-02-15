//! chat_core - Core types and traits for the chat system
//!
//! This crate provides the foundational types used across all chat-related crates:
//! - `config` - Global backend configuration
//! - `todo` - TodoItem, TodoList for task tracking

pub mod config;
pub mod encryption;
pub mod keyword_masking;
pub mod paths;
pub mod todo;

// Re-export commonly used types
pub use config::{Config, ProxyAuth, ProviderConfigs, OpenAIConfig, AnthropicConfig, GeminiConfig, CopilotConfig};
pub use encryption::{decrypt, encrypt};
pub use keyword_masking::{KeywordEntry, KeywordMaskingConfig, MatchType};
pub use paths::*;
pub use todo::{TodoExecution, TodoItem, TodoItemType, TodoList, TodoListStatus, TodoStatus};
