//! Tool System Main Module
//!
//! Category-based tool management system providing zero-hardcoded, highly extensible tool management architecture

use async_trait::async_trait;
use std::fmt::Debug;

// Core modules
pub mod categories;
pub mod category;
pub mod category_factory;
pub mod file_tools;
pub mod registration_system;
pub mod registry;
pub mod tool_factory;
pub mod tool_manager;
pub mod tool_types;

// Test modules
#[cfg(test)]
mod tests;

// Re-export core types
pub use category::{Category, CategoryInfo};
pub use category_factory::{
    create_all_default_categories, create_categories_from_names, get_category_factory,
    CategoryFactory,
};
pub use tool_factory::{create_category_tools, get_tool_factory, ToolFactory};
pub use tool_manager::ToolManager;
pub use tool_types::{ToolCategory, ToolConfig};

// Re-export category related functions
pub use categories::get_default_categories;

// Re-export builder types
pub use tool_manager::ToolManagerBuilder;

// Re-export manager creation function (single entry point)
pub use registration_system::create_registered_tool_manager;
pub use tool_manager::create_default_tool_manager;

/// 工具 trait 定义
#[async_trait]
pub trait Tool: Debug + Send + Sync {
    fn name(&self) -> String;
    fn description(&self) -> String;
    fn parameters(&self) -> Vec<Parameter>;
    fn required_approval(&self) -> bool;
    fn tool_type(&self) -> ToolType;

    /// 返回工具所属的category列表（工具可以属于多个category）
    fn categories(&self) -> Vec<tool_types::CategoryId>;

    /// 对于 RegexParameterExtraction 类型的工具，返回参数提取的正则表达式
    fn parameter_regex(&self) -> Option<String> {
        None
    }

    /// 返回工具特定的自定义提示内容，将在标准格式后追加
    /// 用于提供工具特定的格式要求或处理指导
    fn custom_prompt(&self) -> Option<String> {
        None
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> anyhow::Result<String>;
}

/// 工具参数定义
#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub value: String,
}

/// 工具类型枚举
#[derive(Debug, Clone, PartialEq)]
pub enum ToolType {
    /// 需要AI参数分析的工具
    AIParameterParsing,
    /// 使用正则表达式直接提取参数的工具
    RegexParameterExtraction,
}

// ============================================================================
// Factory Functions
// ============================================================================

/// Create custom tool manager
///
/// Allows users to customize category configuration
pub fn create_custom_tool_manager<F>(configure: F) -> ToolManager
where
    F: FnOnce(
        crate::tools::tool_manager::ToolManagerBuilder,
    ) -> crate::tools::tool_manager::ToolManagerBuilder,
{
    let builder = crate::tools::tool_manager::ToolManagerBuilder::new();
    configure(builder).build()
}

// ============================================================================
// 测试助手函数（仅在测试时编译）
// ============================================================================

#[cfg(test)]
pub fn create_test_tool_manager() -> ToolManager {
    create_default_tool_manager()
}

#[cfg(test)]
mod module_tests {
    use super::*;

    #[test]
    fn test_create_default_tool_manager() {
        let manager = create_default_tool_manager();

        // 验证工具管理器能正常创建，默认包含 3 个类别
        assert_eq!(manager.category_count(), 3);

        // 验证类别包含：文件操作、命令执行、通用助手
        let enabled_categories = manager.get_enabled_categories();
        assert_eq!(enabled_categories.len(), 3);

        // 验证具体类别存在
        let category_ids: Vec<String> = enabled_categories.iter().map(|c| c.id.clone()).collect();
        assert!(category_ids.contains(&"file_operations".to_string()));
        assert!(category_ids.contains(&"command_execution".to_string()));
        assert!(category_ids.contains(&"general_assistant".to_string()));
    }

    #[test]
    fn test_get_available_categories() {
        // 测试通过 ToolManager 获取类别
        let manager = create_default_tool_manager();
        let categories = manager.get_enabled_categories();

        // 验证能正常获取类别
        assert!(!categories.is_empty(), "应该有可用的类别");
    }

    #[test]
    fn test_create_custom_tool_manager() {
        let manager = create_custom_tool_manager(|builder| {
            // 暂时返回空的构建器，等具体类别实现更新后再完善
            builder
        });

        // 基本验证构建器能正常工作
        assert_eq!(manager.category_count(), 0);
    }

    #[test]
    fn test_default_tool_manager() {
        // Test default tool manager creation
        let manager = create_default_tool_manager();

        // The manager should be able to get tools
        assert!(manager.get_tool("read_file").is_some());
    }

    #[test]
    fn test_module_structure() {
        // 验证模块导出的结构
        let manager: ToolManager = create_default_tool_manager();
        let _: Vec<ToolCategory> = manager.get_enabled_categories();

        // 测试类型可用性
        let tool_config = ToolConfig {
            name: "test".to_string(),
            display_name: "Test".to_string(),
            description: "Test tool".to_string(),
            category_id: "test".to_string(),
            enabled: true,
            requires_approval: false,
            auto_prefix: None,
            permissions: vec![],
            tool_type: "AIParameterParsing".to_string(),
            parameter_regex: None,
            custom_prompt: None,
        };

        assert_eq!(tool_config.name, "test");
    }
}
