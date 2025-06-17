//! 工具系统的核心类型定义
//!
//! 本模块包含工具管理系统的基础类型，提供最小化、类型安全的核心抽象。

use crate::tools::categories::get_category_id_for_tool;
use serde::{Deserialize, Serialize};

/// 工具配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfig {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub category_id: String,
    pub enabled: bool,
    pub requires_approval: bool,
    pub auto_prefix: Option<String>,
    pub permissions: Vec<String>,
    pub tool_type: String,
    pub parameter_regex: Option<String>,
    pub custom_prompt: Option<String>,
}

impl ToolConfig {
    /// 从 Tool trait 对象创建 ToolConfig
    pub fn from_tool(tool: Box<dyn crate::tools::Tool>) -> Self {
        ToolConfig {
            name: tool.name(),
            display_name: tool.name(),
            description: tool.description(),
            category_id: get_category_id_for_tool(&tool.name()),
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
        }
    }

    /// 设置类别ID
    pub fn with_category_id(mut self, category_id: String) -> Self {
        self.category_id = category_id;
        self
    }

    /// 设置启用状态
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// 设置显示名称
    pub fn with_display_name(mut self, display_name: String) -> Self {
        self.display_name = display_name;
        self
    }

    /// 设置描述
    pub fn with_description(mut self, description: String) -> Self {
        self.description = description;
        self
    }
}

/// 工具类别结构
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCategory {
    pub id: String,           // 类别ID，与name相同
    pub name: String,         // 内部名称
    pub display_name: String, // 显示名称
    pub description: String,  // 描述
    pub icon: String,         // 图标
    pub enabled: bool,        // 是否启用
    #[serde(default)]
    pub strict_tools_mode: bool, // 严格工具模式
}

impl ToolCategory {
    /// 创建新的工具类别
    pub fn new(name: String, display_name: String, description: String, icon: String) -> Self {
        Self {
            id: name.clone(), // id与name相同
            name,
            display_name,
            description,
            icon,
            enabled: true,
            strict_tools_mode: false,
        }
    }

    /// 设置启用状态
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// 设置严格工具模式
    pub fn with_strict_tools_mode(mut self, strict_tools_mode: bool) -> Self {
        self.strict_tools_mode = strict_tools_mode;
        self
    }
}
