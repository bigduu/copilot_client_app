//! Tool and Category Registry System
//!
//! This module provides a registration system where:
//! 1. Tools register themselves to categories
//! 2. Categories register themselves to the tool manager
//! 3. No hardcoded strings, everything is type-safe

use crate::tools::category::Category;
use crate::tools::tool_types::CategoryId;
use crate::tools::Tool;
use std::collections::HashMap;
use std::sync::Arc;

/// Tool Registry - manages tool registration to categories
pub struct ToolRegistry {
    /// All registered tools
    tools: HashMap<String, Arc<dyn Tool>>,
    /// Category -> Tools mapping
    category_tools: HashMap<CategoryId, Vec<String>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            category_tools: HashMap::new(),
        }
    }

    /// Register a tool
    pub fn register_tool(&mut self, tool: Arc<dyn Tool>) {
        let tool_name = tool.name();
        let categories = tool.categories();

        // Register the tool
        self.tools.insert(tool_name.clone(), tool);

        // Register tool to its categories
        for category in categories {
            self.category_tools
                .entry(category)
                .or_insert_with(Vec::new)
                .push(tool_name.clone());
        }
    }

    /// Get tools for a specific category
    pub fn get_category_tools(&self, category: &CategoryId) -> HashMap<String, Arc<dyn Tool>> {
        let mut result = HashMap::new();

        if let Some(tool_names) = self.category_tools.get(category) {
            for tool_name in tool_names {
                if let Some(tool) = self.tools.get(tool_name) {
                    result.insert(tool_name.clone(), tool.clone());
                }
            }
        }

        result
    }

    /// Get all tools
    pub fn get_all_tools(&self) -> &HashMap<String, Arc<dyn Tool>> {
        &self.tools
    }

    /// Get all categories that have tools
    pub fn get_categories_with_tools(&self) -> Vec<String> {
        self.category_tools
            .keys()
            .map(|k| k.as_str().to_string())
            .collect()
    }
}

/// Category Registry - manages category registration
pub struct CategoryRegistry {
    categories: HashMap<String, Box<dyn Category>>,
}

impl CategoryRegistry {
    pub fn new() -> Self {
        Self {
            categories: HashMap::new(),
        }
    }

    /// Register a category
    pub fn register_category(&mut self, category: Box<dyn Category>) {
        let category_id = category.id();
        self.categories.insert(category_id, category);
    }

    /// Get a category by ID
    pub fn get_category(&self, id: &str) -> Option<&Box<dyn Category>> {
        self.categories.get(id)
    }

    /// Get all categories
    pub fn get_all_categories(&self) -> &HashMap<String, Box<dyn Category>> {
        &self.categories
    }

    /// Get enabled categories
    pub fn get_enabled_categories(&self) -> Vec<&Box<dyn Category>> {
        self.categories
            .values()
            .filter(|category| category.enable())
            .collect()
    }
}

/// Master Registry - combines tool and category registries
pub struct MasterRegistry {
    tool_registry: ToolRegistry,
    category_registry: CategoryRegistry,
}

impl MasterRegistry {
    pub fn new() -> Self {
        Self {
            tool_registry: ToolRegistry::new(),
            category_registry: CategoryRegistry::new(),
        }
    }

    /// Register a tool
    pub fn register_tool(&mut self, tool: Arc<dyn Tool>) {
        self.tool_registry.register_tool(tool);
    }

    /// Register a category
    pub fn register_category(&mut self, category: Box<dyn Category>) {
        self.category_registry.register_category(category);
    }

    /// Get tools for a category
    pub fn get_category_tools(&self, category_id: &CategoryId) -> HashMap<String, Arc<dyn Tool>> {
        self.tool_registry.get_category_tools(category_id)
    }

    /// Get a category
    pub fn get_category(&self, id: &str) -> Option<&Box<dyn Category>> {
        self.category_registry.get_category(id)
    }

    /// Get all enabled categories
    pub fn get_enabled_categories(&self) -> Vec<&Box<dyn Category>> {
        self.category_registry.get_enabled_categories()
    }

    /// Get all tools
    pub fn get_all_tools(&self) -> &HashMap<String, Arc<dyn Tool>> {
        self.tool_registry.get_all_tools()
    }
}

impl Default for MasterRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for creating a configured MasterRegistry
pub struct RegistryBuilder {
    registry: MasterRegistry,
}

impl RegistryBuilder {
    pub fn new() -> Self {
        Self {
            registry: MasterRegistry::new(),
        }
    }

    /// Add a tool to the registry
    pub fn with_tool(mut self, tool: Arc<dyn Tool>) -> Self {
        self.registry.register_tool(tool);
        self
    }

    /// Add a category to the registry
    pub fn with_category(mut self, category: Box<dyn Category>) -> Self {
        self.registry.register_category(category);
        self
    }

    /// Build the final registry
    pub fn build(self) -> MasterRegistry {
        self.registry
    }
}

impl Default for RegistryBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_system() {
        let registry = MasterRegistry::new();

        // This would be tested with actual tool implementations
        // For now, just test the structure
        assert_eq!(registry.get_all_tools().len(), 0);
    }
}
