//! Command Execution Category
//!
//! Contains tools related to system command execution

use crate::tools::category::Category;
use crate::tools::tool_types::CategoryType;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// Command Execution Category
#[derive(Debug)]
pub struct CommandExecutionCategory {
    enabled: bool,
}

impl CommandExecutionCategory {
    /// Create a new command execution category
    pub fn new() -> Self {
        Self { enabled: true }
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
    fn id(&self) -> String {
        "command_execution".to_string()
    }

    fn name(&self) -> String {
        "command_execution".to_string()
    }

    fn display_name(&self) -> String {
        "Command Execution".to_string()
    }

    fn description(&self) -> String {
        "Safely execute system commands and scripts with strict permission control".to_string()
    }

    fn system_prompt(&self) -> String {
        "You are a system command execution assistant responsible for safely executing user-requested system commands. You need to ensure command security, validate command parameters, and avoid executing potentially dangerous operations. Before executing commands, please carefully check the legality and security of commands, and provide detailed execution results and error handling.".to_string()
    }

    fn icon(&self) -> String {
        "⚡".to_string()
    }

    fn frontend_icon(&self) -> String {
        "PlayCircleOutlined".to_string()
    }

    fn color(&self) -> String {
        "magenta".to_string()
    }

    fn strict_tools_mode(&self) -> bool {
        true // Command execution should use strict tool calls
    }

    fn priority(&self) -> i32 {
        5 // Command execution has medium priority and should be used cautiously
    }

    fn enable(&self) -> bool {
        // Can add system permission checks and other logic here
        // For example: check if there are execution permissions, if in a secure environment, etc.
        self.enabled
    }

    fn category_type(&self) -> CategoryType {
        CategoryType::CommandExecution
    }

    fn tools(&self) -> HashMap<String, Arc<dyn Tool>> {
        // Use ToolFactory to create tools for this category
        crate::tools::tool_factory::create_category_tools(
            &crate::tools::tool_types::CategoryId::CommandExecution,
        )
    }
}
