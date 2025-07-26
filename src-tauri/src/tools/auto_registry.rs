//! Auto Registration System
//!
//! This module provides a zero-configuration automatic registration system for tools and categories.
//! Tools and categories register themselves at compile time using the inventory crate.

use inventory;
use std::collections::HashMap;
use std::sync::Arc;
use crate::tools::{Tool, Category};

/// Tool registration information
/// 
/// Contains the metadata needed to automatically register a tool at compile time.
pub struct ToolRegistration {
    /// The unique name of the tool
    pub name: &'static str,
    /// Constructor function that creates a new instance of the tool
    pub constructor: fn() -> Arc<dyn Tool>,
}

/// Category registration information
/// 
/// Contains the metadata needed to automatically register a category at compile time.
pub struct CategoryRegistration {
    /// The unique ID of the category
    pub id: &'static str,
    /// Constructor function that creates a new instance of the category
    pub constructor: fn() -> Box<dyn Category>,
}

// Compile-time collection of all tool and category registrations
inventory::collect!(ToolRegistration);
inventory::collect!(CategoryRegistration);

/// Automatic tool registry
/// 
/// Provides access to all tools and categories that have been automatically registered
/// at compile time using the inventory system.
pub struct AutoToolRegistry;

impl AutoToolRegistry {
    /// Get all automatically registered tools as a HashMap
    /// 
    /// Returns a HashMap mapping tool names to their instances.
    /// Each tool is created fresh using its registered constructor.
    pub fn get_all_tools() -> HashMap<String, Arc<dyn Tool>> {
        inventory::iter::<ToolRegistration>()
            .map(|reg| (reg.name.to_string(), (reg.constructor)()))
            .collect()
    }
    
    /// Create a specific tool by name
    /// 
    /// Returns Some(tool) if a tool with the given name is registered,
    /// None otherwise. Each call creates a fresh instance.
    pub fn create_tool(name: &str) -> Option<Arc<dyn Tool>> {
        inventory::iter::<ToolRegistration>()
            .find(|reg| reg.name == name)
            .map(|reg| (reg.constructor)())
    }
    
    /// Get all automatically registered categories
    /// 
    /// Returns a Vec of all registered categories.
    /// Each category is created fresh using its registered constructor.
    pub fn get_all_categories() -> Vec<Box<dyn Category>> {
        inventory::iter::<CategoryRegistration>()
            .map(|reg| (reg.constructor)())
            .collect()
    }
    
    /// Check if a tool with the given name is registered
    pub fn has_tool(name: &str) -> bool {
        inventory::iter::<ToolRegistration>()
            .any(|reg| reg.name == name)
    }
    
    /// Get all registered tool names
    pub fn get_tool_names() -> Vec<String> {
        inventory::iter::<ToolRegistration>()
            .map(|reg| reg.name.to_string())
            .collect()
    }
    
    /// Get all registered category IDs
    pub fn get_category_ids() -> Vec<String> {
        inventory::iter::<CategoryRegistration>()
            .map(|reg| reg.id.to_string())
            .collect()
    }
}

/// Error types for the tool system
#[derive(Debug, thiserror::Error)]
pub enum ToolSystemError {
    #[error("Missing tool '{tool_name}' required by category '{category_id}'")]
    MissingTool {
        tool_name: String,
        category_id: String,
    },
    #[error("No categories registered")]
    NoCategories,
    #[error("No tools registered")]
    NoTools,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_auto_registry_basic_functionality() {
        // Test that the registry can be accessed without panicking
        let _tools = AutoToolRegistry::get_all_tools();
        let _categories = AutoToolRegistry::get_all_categories();
        let _tool_names = AutoToolRegistry::get_tool_names();
        let _category_ids = AutoToolRegistry::get_category_ids();
    }
    
    #[test]
    fn test_has_tool() {
        // This test will pass even if no tools are registered
        // because has_tool should return false for non-existent tools
        assert!(!AutoToolRegistry::has_tool("non_existent_tool"));
    }
}
