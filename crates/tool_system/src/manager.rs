//! Simple ToolsManager with two global MAPs
//!
//! This is the core of the simplified architecture - just two HashMaps
//! and simple registration logic.

use std::collections::HashMap;
use std::sync::Arc;

use log::info;

use crate::registry::GlobalRegistry;
use crate::types::{Category, CategoryInfo, Tool, ToolConfig};

/// Simple tools manager with two global MAPs
#[derive(Debug)]
pub struct ToolsManager {
    // Two global MAPs - that's it!
    tools: HashMap<String, Arc<dyn Tool>>,
    categories: HashMap<String, Box<dyn Category>>,
}

impl ToolsManager {
    /// Create new tools manager and register everything
    pub fn new() -> Self {
        let mut manager = Self {
            tools: HashMap::new(),
            categories: HashMap::new(),
        };

        // Register all tools and categories
        manager.register_all();
        manager
    }

    /// Register all tools and categories from global registry
    fn register_all(&mut self) {
        // Register all tools to the tools MAP
        self.tools = GlobalRegistry::get_all_tools();
        info!("Registered {} tools:", self.tools.len());
        for name in self.tools.keys() {
            info!("  - Tool: {}", name);
        }

        // Register all categories to the categories MAP
        self.categories = GlobalRegistry::get_all_categories();
        info!("Registered {} categories:", self.categories.len());
        for (id, category) in &self.categories {
            info!(
                "  - Category: {} (ID: {}), Enabled: {}",
                category.metadata().display_name,
                id,
                category.enable()
            );
        }

        // Internal tools and categories are automatically included
        // if they exist - no special handling needed!
    }

    // ============================================================================
    // Public API - combines tools and categories
    // ============================================================================

    /// Get a tool by name
    pub fn get_tool(&self, name: &str) -> Option<&Arc<dyn Tool>> {
        self.tools.get(name)
    }

    /// Get a category by ID
    pub fn get_category(&self, id: &str) -> Option<Box<&dyn Category>> {
        self.categories.get(id).map(|cat| Box::new(cat.as_ref()))
    }

    /// Get all tools for a specific category
    pub fn get_category_tools(&self, category_id: &str) -> Vec<Arc<dyn Tool>> {
        if let Some(category) = self.categories.get(category_id) {
            category
                .required_tools()
                .iter()
                .filter_map(|tool_name| self.tools.get(*tool_name).cloned())
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Get all enabled categories with their tools
    pub fn get_all_categories(&self) -> Vec<CategoryInfo> {
        self.categories
            .values()
            .filter(|cat| cat.enable())
            .map(|cat| cat.build_info(&self.tools))
            .collect()
    }

    /// Get enabled categories sorted by priority
    pub fn get_enabled_categories(&self) -> Vec<CategoryInfo> {
        let mut categories = self.get_all_categories();
        categories.sort_by(|a, b| b.priority.cmp(&a.priority));
        categories
    }

    /// Get category by ID with tools
    pub fn get_category_info(&self, category_id: &str) -> Option<CategoryInfo> {
        self.categories
            .get(category_id)
            .filter(|cat| cat.enable())
            .map(|cat| cat.build_info(&self.tools))
    }

    /// Get all tool configurations for a category
    pub fn get_category_tool_configs(&self, category_id: &str) -> Vec<ToolConfig> {
        if let Some(category_info) = self.get_category_info(category_id) {
            category_info.tools
        } else {
            Vec::new()
        }
    }

    /// Execute a tool by name
    pub async fn execute_tool(
        &self,
        tool_name: &str,
        parameters: Vec<crate::types::Parameter>,
    ) -> anyhow::Result<String> {
        if let Some(tool) = self.tools.get(tool_name) {
            tool.execute(parameters).await
        } else {
            Err(anyhow::anyhow!("Tool '{}' not found", tool_name))
        }
    }

    // ============================================================================
    // Statistics and debugging
    // ============================================================================

    /// Get total number of registered tools
    pub fn tool_count(&self) -> usize {
        self.tools.len()
    }

    /// Get total number of registered categories
    pub fn category_count(&self) -> usize {
        self.categories.len()
    }

    /// Get number of enabled categories
    pub fn enabled_category_count(&self) -> usize {
        self.categories.values().filter(|cat| cat.enable()).count()
    }

    /// Get all tool names
    pub fn get_tool_names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// Get all category IDs
    pub fn get_category_ids(&self) -> Vec<String> {
        self.categories.keys().cloned().collect()
    }
}

impl Default for ToolsManager {
    fn default() -> Self {
        Self::new()
    }
}
