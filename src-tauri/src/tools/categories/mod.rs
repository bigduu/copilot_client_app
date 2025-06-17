//! 工具类别模块
//!
//! 这个模块包含了所有工具类别的实现，每个类别都实现了新的 Category trait。
//! 类别负责管理权限控制和工具组织。

pub mod command_execution;
pub mod file_operations;
pub mod general_assistant;

// 重新导出所有类别
pub use command_execution::CommandExecutionCategory;
pub use file_operations::FileOperationsCategory;
pub use general_assistant::GeneralAssistantCategory;

/// 注册所有默认类别的便捷函数
///
/// 这个函数提供了一个简单的方式来获取所有预定义的类别实例
pub fn get_default_categories() -> Vec<Box<dyn crate::tools::category::Category>> {
    vec![
        Box::new(FileOperationsCategory::new()),
        Box::new(CommandExecutionCategory::new()),
        Box::new(GeneralAssistantCategory::new()),
    ]
}

/// 根据工具名称推断类别ID
///
/// 这个函数保留用于向后兼容性，但在新架构中不再需要
pub fn get_category_id_for_tool(tool_name: &str) -> String {
    match tool_name {
        "read_file" | "create_file" | "delete_file" | "update_file" | "search_files"
        | "simple_search" | "append_file" => "file_operations".to_string(),
        "execute_command" => "command_execution".to_string(),
        _ => "general_assistant".to_string(),
    }
}
