//! System Prompt Builder
//!
//! Constructs the system prompt based on:
//! - Base instructions
//! - Available tools
//! - Active TodoList
//! - Current Context state

// Stub implementation for now
pub struct SystemPromptBuilder;

impl SystemPromptBuilder {
    pub fn new() -> Self {
        Self
    }

    pub fn build(&self) -> String {
        "You are an intelligent agent.".to_string()
    }
}
