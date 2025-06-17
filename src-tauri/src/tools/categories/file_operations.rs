//! 文件操作类别
//!
//! 包含所有文件相关的工具：读取、创建、删除、更新、搜索等

use super::CategoryBuilder;
use crate::tools::types::{ToolCategory, ToolConfig};

/// 文件操作类别建造者
pub struct FileOperationsCategory {
    enabled: bool,
}

impl FileOperationsCategory {
    /// 创建新的文件操作类别
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// 设置是否启用此类别
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl Default for FileOperationsCategory {
    fn default() -> Self {
        Self::new()
    }
}

impl CategoryBuilder for FileOperationsCategory {
    fn build_category(&self) -> ToolCategory {
        ToolCategory {
            id: "file_operations".to_string(),
            name: "file_operations".to_string(),
            display_name: "文件操作".to_string(),
            description: "提供完整的文件操作功能，包括读取、创建、更新、删除和搜索".to_string(),
            icon: "📁".to_string(),
            enabled: self.enabled,
            strict_tools_mode: false, // 文件操作可能需要自然语言描述
        }
    }

    fn build_tools(&self) -> Vec<ToolConfig> {
        use crate::tools::file_tools::*;

        vec![
            // 文件读取工具
            ToolConfig::from_tool(Box::new(ReadFileTool)),
            // 文件创建工具
            ToolConfig::from_tool(Box::new(CreateFileTool)),
            // 文件删除工具
            ToolConfig::from_tool(Box::new(DeleteFileTool)),
            // 文件更新工具
            ToolConfig::from_tool(Box::new(UpdateFileTool)),
            // 文件搜索工具
            ToolConfig::from_tool(Box::new(SearchFilesTool)),
            // 简单搜索工具
            ToolConfig::from_tool(Box::new(SimpleSearchTool)),
            // 文件追加工具
            ToolConfig::from_tool(Box::new(AppendFileTool)),
        ]
    }

    fn enabled(&self) -> bool {
        self.enabled
    }

    fn strict_tools_mode(&self) -> bool {
        false // 文件操作可能需要自然语言描述
    }

    fn priority(&self) -> i32 {
        10 // 文件操作是高优先级的核心功能
    }
}
