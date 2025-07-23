//! 新的 Category trait 定义
//!
//! 基于新架构设计的简洁 Category trait，消除 Builder 模式，直接管理类别功能。

use crate::tools::tool_types::{CategoryType, ToolCategory, ToolConfig};
use std::collections::HashMap;
use std::sync::Arc;

/// Category trait - 工具类别的核心接口
///
/// 每个工具类别都实现这个 trait 来定义其行为和包含的工具。
/// 这是新架构的核心，消除了 Builder 模式的复杂性。
pub trait Category: Send + Sync + std::fmt::Debug {
    /// 类别唯一标识符
    fn id(&self) -> String;

    /// 类别内部名称（通常与 id 相同）
    fn name(&self) -> String;

    /// 类别显示名称（用于UI展示）
    fn display_name(&self) -> String;

    /// 类别描述信息
    fn description(&self) -> String;

    /// 类别的系统提示词（用于AI对话）
    fn system_prompt(&self) -> String;

    /// 类别图标（Emoji，用于简单显示）
    fn icon(&self) -> String;

    /// 前端图标（Ant Design图标名称，用于前端UI）
    fn frontend_icon(&self) -> String;

    /// 类别颜色（用于UI主题）
    fn color(&self) -> String;

    /// 是否启用严格工具模式
    /// 当返回 true 时，用户只能输入以工具调用格式的命令
    fn strict_tools_mode(&self) -> bool;

    /// 类别优先级（用于排序）
    fn priority(&self) -> i32;

    /// 动态判断类别是否启用
    /// 这是权限控制的核心方法，可以基于环境、配置或其他条件动态决定
    fn enable(&self) -> bool;

    /// 获取类别类型
    /// 用于前端识别不同类别的功能性质
    fn category_type(&self) -> CategoryType;

    /// 获取该类别下的所有工具
    /// 返回工具实例的映射
    fn tools(&self) -> HashMap<String, Arc<dyn crate::tools::Tool>>;

    /// 构建完整的类别信息
    /// 包含所有必需的元数据，供前端和工具管理器使用
    fn build_info(&self) -> CategoryInfo {
        CategoryInfo {
            category: ToolCategory {
                id: self.id(),
                name: self.name(),
                display_name: self.display_name(),
                description: self.description(),
                icon: self.frontend_icon(), // 前端图标名称 (e.g., "FileTextOutlined")
                emoji_icon: self.icon(),    // Emoji图标 (e.g., "📁")
                enabled: self.enable(),
                strict_tools_mode: self.strict_tools_mode(),
                system_prompt: self.system_prompt(),
                category_type: self.category_type(),
            },
            tools: self.build_tool_configs(),
            priority: self.priority(),
        }
    }

    /// 构建工具配置列表
    /// 基于类别的工具实例生成配置
    fn build_tool_configs(&self) -> Vec<ToolConfig> {
        let tools = self.tools();
        let category_id = self.id();

        tools
            .values()
            .map(|tool| ToolConfig {
                name: tool.name(),
                display_name: tool.name(),
                description: tool.description(),
                category_id: category_id.clone(),
                enabled: true,
                requires_approval: tool.required_approval(),
                auto_prefix: Some(format!("/{}", tool.name())),
                permissions: vec![],
                tool_type: match tool.tool_type() {
                    crate::tools::ToolType::AIParameterParsing => "AIParameterParsing".to_string(),
                    crate::tools::ToolType::RegexParameterExtraction => {
                        "RegexParameterExtraction".to_string()
                    }
                },
                parameter_regex: tool.parameter_regex(),
                custom_prompt: tool.custom_prompt(),
            })
            .collect()
    }
}

/// 类别信息结构
/// 包含类别的完整信息，包括元数据、工具配置和优先级
#[derive(Debug, Clone)]
pub struct CategoryInfo {
    pub category: ToolCategory,
    pub tools: Vec<ToolConfig>,
    pub priority: i32,
}

impl CategoryInfo {
    /// 获取类别ID
    pub fn id(&self) -> &str {
        &self.category.id
    }

    /// 检查类别是否启用
    pub fn is_enabled(&self) -> bool {
        self.category.enabled
    }

    /// 获取工具数量
    pub fn tool_count(&self) -> usize {
        self.tools.len()
    }

    /// 检查是否使用严格工具模式
    pub fn is_strict_mode(&self) -> bool {
        self.category.strict_tools_mode
    }
}
