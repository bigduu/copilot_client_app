//! General Assistant Category
//!
//! Contains general AI assistant tools

use crate::extension_system::{auto_register_category, Category, CategoryMetadata, CategoryId};

/// General Assistant Category
#[derive(Debug)]
pub struct GeneralAssistantCategory {
    enabled: bool,
}

impl GeneralAssistantCategory {
    pub const CATEGORY_ID: &'static str = "general_assistant";

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
    fn metadata(&self) -> CategoryMetadata {
        CategoryMetadata {
            id: Self::CATEGORY_ID.to_string(),
            name: "general_assistant".to_string(),
            display_name: "General Assistant".to_string(),
            description: "Provides general AI assistant functionality and conversation support, offering intelligent help to users".to_string(),
            icon: "ToolOutlined".to_string(),
            emoji_icon: "🤖".to_string(),
            enabled: self.enabled,
            strict_tools_mode: false, // General assistant requires natural language interaction
            system_prompt: "You are an intelligent general AI assistant capable of understanding various user needs and providing useful help. You can answer questions, provide suggestions, assist in problem-solving, and interact with users in a friendly and professional manner. Please provide accurate and useful information and suggestions based on users' specific needs, maintaining professionalism and a friendly attitude.".to_string(),
            category_type: CategoryId::GeneralAssistant,
            priority: 1, // General assistant has the lowest priority, serving as a fallback function
        }
    }

    fn required_tools(&self) -> &'static [&'static str] {
        // Currently, the general assistant category has no specific tool implementations
        // This can serve as a placeholder for future extensions
        &[]
    }

    fn enable(&self) -> bool {
        // General assistant category is usually always enabled as a fallback function
        self.enabled
    }
}

// Auto-register the category
auto_register_category!(GeneralAssistantCategory);
