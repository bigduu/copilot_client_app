//! Category-related type definitions

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use super::{CategoryId, Tool, ToolConfig};

/// Unified category metadata structure (eliminates duplication)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryMetadata {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub icon: String,       // Frontend icon name (e.g., "FileTextOutlined")
    pub emoji_icon: String, // Emoji icon (e.g., "📁")
    pub enabled: bool,
    pub strict_tools_mode: bool,
    pub system_prompt: String,
    pub category_type: CategoryId,
    pub priority: i32,
}

/// Simplified Category trait - only metadata and tool requirements
pub trait Category: Send + Sync + std::fmt::Debug {
    /// Get category metadata
    fn metadata(&self) -> CategoryMetadata;

    /// Declare required tool names for this category
    fn required_tools(&self) -> &'static [&'static str];

    /// Dynamic enable check (can be overridden for permission control)
    fn enable(&self) -> bool {
        true
    }

    /// Build category info with tools (receives tools MAP from manager)
    fn build_info(&self, tools: &HashMap<String, Arc<dyn Tool>>) -> CategoryInfo {
        let metadata = self.metadata();
        let tool_configs = self.build_tool_configs(tools, &metadata.id);

        CategoryInfo {
            category: ToolCategory::from_metadata(metadata),
            tools: tool_configs,
            priority: self.metadata().priority,
        }
    }

    /// Build tool configurations for this category
    fn build_tool_configs(
        &self,
        tools: &HashMap<String, Arc<dyn Tool>>,
        category_id: &str,
    ) -> Vec<ToolConfig> {
        self.required_tools()
            .iter()
            .filter_map(|tool_name| tools.get(*tool_name))
            .map(|tool| ToolConfig {
                name: tool.name(),
                display_name: tool.name(),
                description: tool.description(),
                category_id: category_id.to_string(),
                enabled: true,
                requires_approval: tool.required_approval(),
                auto_prefix: Some(format!("/{}", tool.name())),
                permissions: vec![],
                tool_type: match tool.tool_type() {
                    crate::extension_system::types::ToolType::AIParameterParsing => {
                        "AIParameterParsing".to_string()
                    }
                    crate::extension_system::types::ToolType::RegexParameterExtraction => {
                        "RegexParameterExtraction".to_string()
                    }
                },
                parameter_regex: tool.parameter_regex(),
                custom_prompt: tool.custom_prompt(),
                hide_in_selector: tool.hide_in_selector(),
                display_preference: tool.display_preference(),
            })
            .collect()
    }
}

/// Tool category structure (for API compatibility)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCategory {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub icon: String,
    pub emoji_icon: String,
    pub enabled: bool,
    pub strict_tools_mode: bool,
    pub system_prompt: String,
    pub category_type: CategoryId,
}

impl ToolCategory {
    /// Create from metadata
    pub fn from_metadata(metadata: CategoryMetadata) -> Self {
        Self {
            id: metadata.id,
            name: metadata.name,
            display_name: metadata.display_name,
            description: metadata.description,
            icon: metadata.icon,
            emoji_icon: metadata.emoji_icon,
            enabled: metadata.enabled,
            strict_tools_mode: metadata.strict_tools_mode,
            system_prompt: metadata.system_prompt,
            category_type: metadata.category_type,
        }
    }
}

/// Category information structure
#[derive(Debug, Clone)]
pub struct CategoryInfo {
    pub category: ToolCategory,
    pub tools: Vec<ToolConfig>,
    pub priority: i32,
}

impl CategoryInfo {
    /// Get category ID
    pub fn id(&self) -> &str {
        &self.category.id
    }

    /// Check if category is enabled
    pub fn is_enabled(&self) -> bool {
        self.category.enabled
    }

    /// Get tool count
    pub fn tool_count(&self) -> usize {
        self.tools.len()
    }

    /// Check if using strict tools mode
    pub fn is_strict_mode(&self) -> bool {
        self.category.strict_tools_mode
    }
}
