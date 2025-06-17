//! 命令执行类别
//!
//! 包含系统命令执行相关的工具

use crate::tools::category::Category;
use crate::tools::tool_types::CategoryType;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// 命令执行类别
#[derive(Debug)]
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

impl Category for CommandExecutionCategory {
    fn id(&self) -> String {
        "command_execution".to_string()
    }

    fn name(&self) -> String {
        "command_execution".to_string()
    }

    fn display_name(&self) -> String {
        "命令执行".to_string()
    }

    fn description(&self) -> String {
        "安全执行系统命令和脚本，需要严格的权限控制".to_string()
    }

    fn system_prompt(&self) -> String {
        "你是一个系统命令执行助手，专门负责安全地执行用户请求的系统命令。你需要确保命令的安全性，验证命令参数，避免执行潜在危险的操作。在执行命令前，请仔细检查命令的合法性和安全性，并提供详细的执行结果和错误处理。".to_string()
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
        true // 命令执行应该使用严格的工具调用
    }

    fn priority(&self) -> i32 {
        5 // 命令执行是中等优先级，需要谨慎使用
    }

    fn enable(&self) -> bool {
        // 可以在这里添加系统权限检查等逻辑
        // 例如：检查是否有执行权限、是否在安全环境中等
        self.enabled
    }

    fn category_type(&self) -> CategoryType {
        CategoryType::CommandExecution
    }

    fn tools(&self) -> HashMap<String, Arc<dyn Tool>> {
        use crate::tools::file_tools::ExecuteCommandTool;

        let mut tools: HashMap<String, Arc<dyn Tool>> = HashMap::new();

        // 命令执行工具
        tools.insert("execute_command".to_string(), Arc::new(ExecuteCommandTool));

        tools
    }
}
