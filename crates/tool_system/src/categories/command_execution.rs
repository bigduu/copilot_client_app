//! Command Execution Category
//!
//! Contains tools related to system command execution

use crate::{
    types::{Category, CategoryId, CategoryMetadata},
};

/// Command Execution Category
#[derive(Debug)]
pub struct CommandExecutionCategory {
    enabled: bool,
}

impl CommandExecutionCategory {
    pub const CATEGORY_ID: &'static str = "command_execution";

    /// Create a new command execution category (disabled by default)
    pub fn new() -> Self {
        Self { enabled: false }
    }

    /// Set whether this category is enabled
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl Default for CommandExecutionCategory {
    fn default() -> Self {
        Self::new()
    }
}

impl Category for CommandExecutionCategory {
    fn metadata(&self) -> CategoryMetadata {
        CategoryMetadata {
            id: Self::CATEGORY_ID.to_string(),
            name: "command_execution".to_string(),
            display_name: "Command Execution".to_string(),
            description: "Safely execute system commands and scripts with strict permission control".to_string(),
            icon: "PlayCircleOutlined".to_string(),
            emoji_icon: "⚡".to_string(),
            enabled: self.enabled,
            strict_tools_mode: true, // Command execution should use strict tool calls
            system_prompt: "You are a system command execution assistant responsible for safely executing user-requested system commands. You need to ensure command security, validate command parameters, and avoid executing potentially dangerous operations. Before executing commands, please carefully check the legality and security of commands, and provide detailed execution results and error handling.".to_string(),
            category_type: CategoryId::CommandExecution,
            priority: 5, // Command execution has medium priority and should be used cautiously
        }
    }

    fn required_tools(&self) -> &'static [&'static str] {
        &["execute_command"]
    }

    fn enable(&self) -> bool {
        // Can add system permission checks and other logic here
        // For example: check if there are execution permissions, if in a secure environment, etc.
        self.enabled
    }
}

// Category registration handled by category system
