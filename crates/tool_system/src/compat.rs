//! Compatibility layer for the old tools system
//!
//! This module provides compatibility functions to bridge the gap between
//! the old tools system and the new extension system during migration.

use crate::{manager::ToolsManager, types::{CategoryInfo, ToolCategory, ToolConfig}};

/// Compatibility wrapper to make ToolsManager work with existing command APIs
impl ToolsManager {
    /// Get category by ID (compatibility method)
    pub fn get_category_by_id(&self, category_id: &str) -> Option<ToolCategory> {
        self.get_category_info(category_id)
            .map(|info| info.category)
    }

    /// Get category tool configs (compatibility method)
    pub fn get_category_tool_configs_compat(&self, category_id: &str) -> Vec<ToolConfig> {
        self.get_category_tool_configs(category_id)
    }

    /// List tools for UI (compatibility method)
    pub fn list_tools_for_ui(&self) -> Vec<ToolConfig> {
        let mut ui_tools = Vec::new();
        for category in self.get_all_categories() {
            for tool_config in category.tools {
                ui_tools.push(tool_config);
            }
        }
        ui_tools
    }

    /// List tools (compatibility method)
    pub fn list_tools(&self) -> String {
        let tool_names = self.get_tool_names();
        format!("Available tools: {}", tool_names.join(", "))
    }

    /// Get enabled category info (compatibility method)
    pub fn get_enabled_category_info(&self) -> Vec<CategoryInfo> {
        self.get_enabled_categories()
    }

    /// Get all category info (compatibility method)
    pub fn get_all_category_info(&self) -> Vec<CategoryInfo> {
        self.get_all_categories()
    }
}
