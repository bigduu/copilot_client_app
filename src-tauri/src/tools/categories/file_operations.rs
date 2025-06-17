//! 文件操作类别
//!
//! 包含所有文件相关的工具：读取、创建、删除、更新、搜索等

use crate::tools::category::Category;
use crate::tools::tool_types::CategoryType;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// 文件操作类别
#[derive(Debug)]
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

impl Category for FileOperationsCategory {
    fn id(&self) -> String {
        "file_operations".to_string()
    }

    fn name(&self) -> String {
        "file_operations".to_string()
    }

    fn display_name(&self) -> String {
        "文件操作".to_string()
    }

    fn description(&self) -> String {
        "提供完整的文件操作功能，包括读取、创建、更新、删除和搜索".to_string()
    }

    fn system_prompt(&self) -> String {
        "你是一个专业的文件操作助手，负责处理各种文件相关的任务，包括文件的读取、创建、更新、删除和搜索。你需要确保文件操作的安全性和准确性，遵循最佳实践进行文件系统操作。在进行文件操作时，请注意权限检查、路径验证和数据完整性。".to_string()
    }

    fn icon(&self) -> String {
        "📁".to_string()
    }

    fn frontend_icon(&self) -> String {
        "FileTextOutlined".to_string()
    }

    fn color(&self) -> String {
        "green".to_string()
    }

    fn strict_tools_mode(&self) -> bool {
        false // 文件操作可能需要自然语言描述
    }

    fn priority(&self) -> i32 {
        10 // 文件操作是高优先级的核心功能
    }

    fn enable(&self) -> bool {
        // 可以在这里添加文件系统权限检查等逻辑
        self.enabled
    }

    fn category_type(&self) -> CategoryType {
        CategoryType::FileOperations
    }

    fn tools(&self) -> HashMap<String, Arc<dyn Tool>> {
        use crate::tools::file_tools::*;

        let mut tools: HashMap<String, Arc<dyn Tool>> = HashMap::new();

        // 文件读取工具
        tools.insert("read_file".to_string(), Arc::new(ReadFileTool));
        // 文件创建工具
        tools.insert("create_file".to_string(), Arc::new(CreateFileTool));
        // 文件删除工具
        tools.insert("delete_file".to_string(), Arc::new(DeleteFileTool));
        // 文件更新工具
        tools.insert("update_file".to_string(), Arc::new(UpdateFileTool));
        // 文件搜索工具
        tools.insert("search_files".to_string(), Arc::new(SearchFilesTool));
        // 简单搜索工具
        tools.insert("simple_search".to_string(), Arc::new(SimpleSearchTool));
        // 文件追加工具
        tools.insert("append_file".to_string(), Arc::new(AppendFileTool));

        tools
    }
}
