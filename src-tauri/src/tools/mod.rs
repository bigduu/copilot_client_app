//! 工具系统主模块
//!
//! 基于建造者模式的工具管理系统，提供零硬编码、高扩展性的工具管理架构

use async_trait::async_trait;
use std::fmt::Debug;

// 核心模块
pub mod categories;
pub mod config_manager;
pub mod file_tools;

pub mod tool_manager;
pub mod types;

// 测试模块
#[cfg(test)]
mod tests;

// 重新导出核心类型
pub use config_manager::ToolConfigManager;

pub use tool_manager::ToolManager;
pub use types::{ToolCategory, ToolConfig};

// 重新导出类别建造者类型
pub use categories::{CategoryBuilder, ToolManagerBuilder};

// 重新导出管理器创建函数
pub use tool_manager::{
    create_basic_tool_manager, create_default_tool_manager, create_tool_manager_with_config_dir,
    ToolManagerFactory,
};

/// 工具 trait 定义
#[async_trait]
pub trait Tool: Debug + Send + Sync {
    fn name(&self) -> String;
    fn description(&self) -> String;
    fn parameters(&self) -> Vec<Parameter>;
    fn required_approval(&self) -> bool;
    fn tool_type(&self) -> ToolType;

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
// 工厂函数 - 提供向后兼容性
// ============================================================================

/// 创建工具管理器（向后兼容函数）
pub fn create_tool_manager() -> ToolManager {
    create_basic_tool_manager()
}

/// 使用建造者模式创建工具管理器（示例实现）
pub fn create_tool_manager_with_builder() -> ToolManager {
    use categories::*;

    // 使用建造者模式构建工具配置
    let _tool_configs = ToolManagerBuilder::new()
        .register_category(FileOperationsCategory::new())
        .register_category(CommandExecutionCategory::new())
        .register_category(GeneralAssistantCategory::new())
        .build();

    // 创建工具管理器（使用新的默认实现）
    create_default_tool_manager()
}

/// 构建默认的 ToolManager（主要入口点）
///
/// 这是新架构的主要入口点，自动注册所有可用的工具类别
/// 完全基于建造者模式，实现零硬编码
pub fn build_default_tool_manager() -> ToolManager {
    create_default_tool_manager()
}

// ============================================================================
// 便利函数
// ============================================================================

/// 获取所有可用的工具类别
pub fn get_available_categories() -> Vec<ToolCategory> {
    use categories::*;

    ToolManagerBuilder::new()
        .register_category(FileOperationsCategory::new())
        .register_category(CommandExecutionCategory::new())
        .register_category(GeneralAssistantCategory::new())
        .get_all_categories()
}

/// 获取启用的工具类别
pub fn get_enabled_categories() -> Vec<ToolCategory> {
    use categories::*;

    ToolManagerBuilder::new()
        .register_category(FileOperationsCategory::new())
        .register_category(CommandExecutionCategory::new())
        .register_category(GeneralAssistantCategory::new())
        .get_enabled_categories()
}

/// 创建自定义工具管理器
///
/// 允许用户自定义类别配置
pub fn create_custom_tool_manager<F>(configure: F) -> ToolManager
where
    F: FnOnce(ToolManagerBuilder) -> ToolManagerBuilder,
{
    ToolManagerFactory::create_custom(configure)
}

// ============================================================================
// 测试助手函数（仅在测试时编译）
// ============================================================================

#[cfg(test)]
pub fn create_test_tool_manager() -> ToolManager {
    ToolManagerFactory::create_test()
}

#[cfg(test)]
mod module_tests {
    use super::*;

    #[test]
    fn test_create_default_tool_manager() {
        let manager = create_default_tool_manager();

        // 验证基本工具存在
        assert!(manager.get_tool("read_file").is_some());
        assert!(manager.get_tool("create_file").is_some());
        assert!(manager.get_tool("execute_command").is_some());
    }

    #[test]
    fn test_get_available_categories() {
        let categories = get_available_categories();

        // 验证有预期的类别
        assert!(categories.len() >= 3);

        let category_names: Vec<String> = categories.iter().map(|c| c.name.clone()).collect();
        assert!(category_names.contains(&"file_operations".to_string()));
        assert!(category_names.contains(&"command_execution".to_string()));
        assert!(category_names.contains(&"general_assistant".to_string()));
    }

    #[test]
    fn test_create_custom_tool_manager() {
        let manager = create_custom_tool_manager(|builder| {
            builder
                .register_category(categories::FileOperationsCategory::new())
                .register_category(categories::GeneralAssistantCategory::new())
            // 故意省略 CommandExecutionCategory
        });

        // 验证文件操作工具存在
        assert!(manager.get_tool("read_file").is_some());

        // CommandExecutionCategory 被省略，但工具实例仍然创建
        // 因为工具实例创建是独立的
        assert!(manager.get_tool("execute_command").is_some());
    }

    #[test]
    fn test_backward_compatibility() {
        // 测试向后兼容性函数
        let manager1 = create_tool_manager();
        let manager2 = build_default_tool_manager();

        // 两个管理器都应该能获取到相同的工具
        assert!(manager1.get_tool("read_file").is_some());
        assert!(manager2.get_tool("read_file").is_some());
    }

    #[test]
    fn test_module_structure() {
        // 验证模块导出的结构
        let _: ToolManager = create_default_tool_manager();
        let _: Vec<ToolCategory> = get_available_categories();
        let _: Vec<ToolCategory> = get_enabled_categories();

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
