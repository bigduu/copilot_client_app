//! 命令执行类别
//!
//! 包含系统命令执行相关的工具

use super::CategoryBuilder;
use crate::tools::types::{NewToolCategory, ToolConfig};

/// 命令执行类别建造者
pub struct CommandExecutionCategory {
    enabled: bool,
}

impl CommandExecutionCategory {
    /// 创建新的命令执行类别
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// 设置是否启用此类别
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

impl CategoryBuilder for CommandExecutionCategory {
    fn build_category(&self) -> NewToolCategory {
        NewToolCategory {
            name: "command_execution".to_string(),
            display_name: "命令执行".to_string(),
            description: "安全执行系统命令和脚本，需要严格的权限控制".to_string(),
            icon: "⚡".to_string(),
            enabled: self.enabled,
            strict_tools_mode: true, // 命令执行应该使用严格的工具调用
        }
    }

    fn build_tools(&self) -> Vec<ToolConfig> {
        use crate::tools::file_tools::ExecuteCommandTool;

        vec![
            // 命令执行工具
            ToolConfig::from_tool(Box::new(ExecuteCommandTool)),
        ]
    }

    fn enabled(&self) -> bool {
        self.enabled
    }

    fn strict_tools_mode(&self) -> bool {
        true // 命令执行应该使用严格的工具调用
    }

    fn priority(&self) -> i32 {
        5 // 命令执行是中等优先级，需要谨慎使用
    }
}
