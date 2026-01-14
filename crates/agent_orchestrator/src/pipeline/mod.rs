//! Pipeline module - Request preparation and enhancement
//!
//! Handles converting states/events into LLM requests and System Prompts.

pub mod message_convert;
pub mod system_prompt;

pub use system_prompt::SystemPromptBuilder;
