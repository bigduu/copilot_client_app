//! Compatibility layer for the old tools system
//!
//! This module provides compatibility functions to bridge the gap between
//! the old tools system and the new extension system during migration.

use crate::extension_system::{ToolCategory, ToolConfig, ToolsManager};

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
    pub fn list_tools_for_ui(&self) -> Vec<crate::command::tools::ToolUIInfo> {
        let mut ui_tools = Vec::new();

        for category_info in self.get_all_categories() {
            for tool_config in category_info.tools {
                // Get the actual tool to extract parameter information
                let parameters = if let Some(tool) = self.get_tool(&tool_config.name) {
                    tool.parameters()
                        .into_iter()
                        .map(|p| crate::command::tools::ParameterInfo {
                            name: p.name,
                            description: p.description,
                            required: p.required,
                            param_type: "string".to_string(),
                        })
                        .collect()
                } else {
                    vec![]
                };

                ui_tools.push(crate::command::tools::ToolUIInfo {
                    name: tool_config.name,
                    description: tool_config.description,
                    parameters,
                    tool_type: tool_config.tool_type,
                    parameter_regex: tool_config.parameter_regex,
                    ai_response_template: tool_config.custom_prompt,
                });
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
    pub fn get_enabled_category_info(&self) -> Vec<crate::extension_system::CategoryInfo> {
        self.get_enabled_categories()
    }

    /// Get all category info (compatibility method)
    pub fn get_all_category_info(&self) -> Vec<crate::extension_system::CategoryInfo> {
        self.get_all_categories()
    }
}
