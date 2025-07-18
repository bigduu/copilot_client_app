//! General Assistant Category
//!
//! Contains general AI assistant tools

use crate::tools::category::Category;
use crate::tools::tool_types::CategoryType;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// General Assistant Category
#[derive(Debug)]
pub struct GeneralAssistantCategory {
    enabled: bool,
}

impl GeneralAssistantCategory {
    /// Create a new general assistant category
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// Set whether this category is enabled
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
        "General Assistant".to_string()
    }

    fn description(&self) -> String {
        "Provides general AI assistant functionality and conversation support, offering intelligent help to users".to_string()
    }

    fn system_prompt(&self) -> String {
        "You are an intelligent general AI assistant capable of understanding various user needs and providing useful help. You can answer questions, provide suggestions, assist in problem-solving, and interact with users in a friendly and professional manner. Please provide accurate and useful information and suggestions based on users' specific needs, maintaining professionalism and a friendly attitude.".to_string()
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
        false // General assistant requires natural language interaction
    }

    fn priority(&self) -> i32 {
        1 // General assistant has the lowest priority, serving as a fallback function
    }

    fn enable(&self) -> bool {
        // General assistant category is usually always enabled as a fallback function
        self.enabled
    }

    fn category_type(&self) -> CategoryType {
        CategoryType::GeneralAssistant
    }

    fn tools(&self) -> HashMap<String, Arc<dyn Tool>> {
        // Currently, the general assistant category has no specific tool implementations
        // This can serve as a placeholder for future extensions, such as:
        // - Code generation tools
        // - Document analysis tools
        // - Intelligent Q&A tools
        HashMap::new()
    }
}
