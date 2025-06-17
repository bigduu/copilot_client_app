//! 通用助手类别
//!
//! 包含通用的AI助手工具

use crate::tools::category::Category;
use crate::tools::tool_types::CategoryType;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// 通用助手类别
#[derive(Debug)]
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

impl Category for GeneralAssistantCategory {
    fn id(&self) -> String {
        "general_assistant".to_string()
    }

    fn name(&self) -> String {
        "general_assistant".to_string()
    }

    fn display_name(&self) -> String {
        "通用助手".to_string()
    }

    fn description(&self) -> String {
        "提供通用的AI助手功能和对话支持，为用户提供智能帮助".to_string()
    }

    fn system_prompt(&self) -> String {
        "你是一个智能的通用AI助手，能够理解用户的各种需求并提供有用的帮助。你可以回答问题、提供建议、协助解决问题，并以友好和专业的方式与用户交互。请根据用户的具体需求，提供准确、有用的信息和建议，保持专业性和友好的态度。".to_string()
    }

    fn icon(&self) -> String {
        "🤖".to_string()
    }

    fn frontend_icon(&self) -> String {
        "ToolOutlined".to_string()
    }

    fn color(&self) -> String {
        "blue".to_string()
    }

    fn strict_tools_mode(&self) -> bool {
        false // 通用助手需要自然语言交互
    }

    fn priority(&self) -> i32 {
        1 // 通用助手是最低优先级，作为兜底功能
    }

    fn enable(&self) -> bool {
        // 通用助手类别通常总是启用的，作为兜底功能
        self.enabled
    }

    fn category_type(&self) -> CategoryType {
        CategoryType::GeneralAssistant
    }

    fn tools(&self) -> HashMap<String, Arc<dyn Tool>> {
        // 目前通用助手类别暂时没有具体的工具实现
        // 这可以作为未来扩展的占位符，例如：
        // - 代码生成工具
        // - 文档分析工具
        // - 智能问答工具
        HashMap::new()
    }
}
