//! 工具类别模块
//!
//! 这个模块包含了所有工具类别的实现，每个类别都实现了 CategoryBuilder trait。
//! 类别负责管理权限控制和工具组织。

pub mod command_execution;
pub mod file_operations;
pub mod general_assistant;

// 重新导出所有类别建造者
pub use command_execution::CommandExecutionCategory;
pub use file_operations::FileOperationsCategory;
pub use general_assistant::GeneralAssistantCategory;

use crate::tools::types::{ToolCategory, ToolConfig};
use std::collections::HashMap;

/// 类别建造者 trait
///
/// 所有工具类别都必须实现这个 trait 来定义：
/// 1. 如何构建类别
/// 2. 包含哪些工具
/// 3. 权限控制逻辑
/// 4. 严格工具模式设置
/// 5. 图标和颜色配置
pub trait CategoryBuilder: Send + Sync {
    /// 构建类别信息
    fn build_category(&self) -> ToolCategory;

    /// 构建该类别包含的所有工具配置
    fn build_tools(&self) -> Vec<ToolConfig>;

    /// 检查该类别是否启用
    ///
    /// 这是权限控制的核心方法，只有类别控制权限，工具本身不包含权限逻辑
    fn enabled(&self) -> bool;

    /// 获取严格工具模式设置
    ///
    /// 当返回 true 时，用户只能输入 `/tools` 开头的命令
    /// 默认实现返回 false，保持向后兼容性
    fn strict_tools_mode(&self) -> bool {
        false
    }

    /// 构建优先级
    fn priority(&self) -> i32 {
        0
    }

    /// 获取类别的图标名称
    /// 默认实现提供基于类别ID的图标映射
    fn icon(&self) -> String {
        let category = self.build_category();
        get_default_icon(&category.name)
    }

    /// 获取类别的颜色
    /// 默认实现提供基于类别ID的颜色映射
    fn color(&self) -> String {
        let category = self.build_category();
        get_default_color(&category.name)
    }

    /// 获取前端兼容的图标名称
    /// 返回 Ant Design 图标名称
    fn frontend_icon(&self) -> String {
        let category = self.build_category();
        get_frontend_icon(&category.name)
    }

    /// 自动从工具生成 ToolConfigs
    ///
    /// 这个方法提供了从工具自动生成配置的默认实现
    /// 类别实现者可以重写这个方法来自定义配置生成逻辑
    fn build_tool_configs(&self) -> Vec<ToolConfig> {
        let category = self.build_category();
        let mut tools = self.build_tools();

        // 确保所有工具都设置了正确的 category_id
        for tool in &mut tools {
            tool.category_id = category.name.clone();
        }

        tools
    }

    /// 创建工具实例映射
    ///
    /// 这个方法允许类别创建实际的工具实例
    /// 默认实现返回空映射，子类可以重写以提供实际实现
    fn create_tool_instances(
        &self,
    ) -> std::collections::HashMap<String, std::sync::Arc<dyn crate::tools::Tool>> {
        std::collections::HashMap::new()
    }
}

/// 工具类别映射工具函数
/// 这些函数提供了独立于trait的类别映射逻辑

/// 根据工具名称推断类别ID
pub fn get_category_id_for_tool(tool_name: &str) -> String {
    match tool_name {
        "read_file" | "create_file" | "delete_file" | "update_file" | "search_files"
        | "simple_search" | "append_file" => "file_operations".to_string(),
        "execute_command" => "command_execution".to_string(),
        _ => "general_assistant".to_string(),
    }
}

/// 获取类别的默认图标
pub fn get_default_icon(category_id: &str) -> String {
    match category_id {
        "file_operations" => "📁".to_string(),
        "command_execution" => "⚡".to_string(),
        "general_assistant" => "🤖".to_string(),
        _ => "🔧".to_string(),
    }
}

/// 获取类别的默认颜色
pub fn get_default_color(category_id: &str) -> String {
    match category_id {
        "file_operations" => "green".to_string(),
        "command_execution" => "magenta".to_string(),
        "general_assistant" => "blue".to_string(),
        _ => "default".to_string(),
    }
}

/// 获取前端兼容的图标名称
pub fn get_frontend_icon(category_id: &str) -> String {
    match category_id {
        "file_operations" => "FileTextOutlined".to_string(),
        "command_execution" => "PlayCircleOutlined".to_string(),
        "general_assistant" => "ToolOutlined".to_string(),
        _ => "ToolOutlined".to_string(),
    }
}

/// 工具管理器建造者
///
/// 负责注册所有类别并构建完整的工具配置
pub struct ToolManagerBuilder {
    categories: Vec<Box<dyn CategoryBuilder>>,
}

impl ToolManagerBuilder {
    /// 创建新的工具管理器建造者
    pub fn new() -> Self {
        Self {
            categories: Vec::new(),
        }
    }

    /// 注册一个类别建造者
    pub fn register_category<T: CategoryBuilder + 'static>(mut self, category: T) -> Self {
        self.categories.push(Box::new(category));
        self
    }

    /// 构建完整的工具配置映射
    pub fn build(self) -> HashMap<String, ToolConfig> {
        let mut tools = HashMap::new();

        for category_builder in self.categories {
            // 只有启用的类别才会添加其工具
            if category_builder.enabled() {
                let category_tools = category_builder.build_tool_configs();
                for tool in category_tools {
                    tools.insert(tool.name.clone(), tool);
                }
            }
        }

        tools
    }

    /// 获取所有类别信息（不论是否启用）
    pub fn get_all_categories(&self) -> Vec<ToolCategory> {
        self.categories
            .iter()
            .map(|builder| builder.build_category())
            .collect()
    }

    /// 获取启用的类别信息
    pub fn get_enabled_categories(&self) -> Vec<ToolCategory> {
        self.categories
            .iter()
            .filter(|builder| builder.enabled())
            .map(|builder| builder.build_category())
            .collect()
    }

    /// 构建完整的类别和工具配置
    /// 返回 (categories, tool_configs) 元组
    pub fn build_with_categories(self) -> (Vec<ToolCategory>, Vec<ToolConfig>) {
        let mut categories = Vec::new();
        let mut tool_configs = Vec::new();

        for category_builder in self.categories {
            // 构建类别信息
            let mut new_category = category_builder.build_category();

            // 设置图标和颜色
            new_category.icon = category_builder.icon();
            new_category.enabled = category_builder.enabled();
            new_category.strict_tools_mode = category_builder.strict_tools_mode();

            categories.push(new_category);

            // 只有启用的类别才会添加其工具
            if category_builder.enabled() {
                let category_tools = category_builder.build_tool_configs();
                tool_configs.extend(category_tools);
            }
        }

        (categories, tool_configs)
    }
}

impl Default for ToolManagerBuilder {
    fn default() -> Self {
        Self::new()
    }
}
