//! 通用助手类别
//!
//! 包含通用的AI助手工具

use super::CategoryBuilder;
use crate::tools::types::{NewToolCategory, ToolConfig};

/// 通用助手类别建造者
pub struct GeneralAssistantCategory {
    enabled: bool,
}

impl GeneralAssistantCategory {
    /// 创建新的通用助手类别
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// 设置是否启用此类别
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

impl Default for GeneralAssistantCategory {
    fn default() -> Self {
        Self::new()
    }
}

impl CategoryBuilder for GeneralAssistantCategory {
    fn build_category(&self) -> NewToolCategory {
        NewToolCategory {
            name: "general_assistant".to_string(),
            display_name: "通用助手".to_string(),
            description: "提供通用的AI助手功能和对话支持，为用户提供智能帮助".to_string(),
            icon: "🤖".to_string(),
            enabled: self.enabled,
            strict_tools_mode: false, // 通用助手需要自然语言交互
        }
    }

    fn build_tools(&self) -> Vec<ToolConfig> {
        // 目前通用助手类别暂时没有具体的工具实现
        // 这可以作为未来扩展的占位符，例如：
        // - 代码生成工具
        // - 文档分析工具
        // - 智能问答工具
        vec![]
    }

    fn enabled(&self) -> bool {
        self.enabled
    }

    fn strict_tools_mode(&self) -> bool {
        false // 通用助手需要自然语言交互
    }

    fn priority(&self) -> i32 {
        1 // 通用助手是最低优先级，作为兜底功能
    }
}
