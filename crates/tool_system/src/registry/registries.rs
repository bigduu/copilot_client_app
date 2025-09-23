//! Global registration tables for tools and categories

use inventory;
use std::collections::HashMap;
use std::sync::Arc;

use crate::types::{Tool, Category};

/// Tool registration information
pub struct ToolRegistration {
    /// The unique name of the tool
    pub name: &'static str,
    /// Constructor function that creates a new instance of the tool
    pub constructor: fn() -> Arc<dyn Tool>,
}

/// Category registration information
pub struct CategoryRegistration {
    /// The unique ID of the category
    pub id: &'static str,
    /// Constructor function that creates a new instance of the category
    pub constructor: fn() -> Box<dyn Category>,
}

// Compile-time collection of all tool and category registrations
inventory::collect!(ToolRegistration);
inventory::collect!(CategoryRegistration);

/// Global registry for tools and categories
pub struct GlobalRegistry;

impl GlobalRegistry {
    /// Get all registered tools as a HashMap
    pub fn get_all_tools() -> HashMap<String, Arc<dyn Tool>> {
        inventory::iter::<ToolRegistration>()
            .map(|reg| (reg.name.to_string(), (reg.constructor)()))
            .collect()
    }
    
    /// Get all registered categories as a HashMap
    pub fn get_all_categories() -> HashMap<String, Box<dyn Category>> {
        inventory::iter::<CategoryRegistration>()
            .map(|reg| (reg.id.to_string(), (reg.constructor)()))
            .collect()
    }
    
    /// Create a specific tool by name
    pub fn create_tool(name: &str) -> Option<Arc<dyn Tool>> {
        inventory::iter::<ToolRegistration>()
            .find(|reg| reg.name == name)
            .map(|reg| (reg.constructor)())
    }
    
    /// Create a specific category by ID
    pub fn create_category(id: &str) -> Option<Box<dyn Category>> {
        inventory::iter::<CategoryRegistration>()
            .find(|reg| reg.id == id)
            .map(|reg| (reg.constructor)())
    }
    
    /// Check if a tool with the given name is registered
    pub fn has_tool(name: &str) -> bool {
        inventory::iter::<ToolRegistration>()
            .any(|reg| reg.name == name)
    }
    
    /// Check if a category with the given ID is registered
    pub fn has_category(id: &str) -> bool {
        inventory::iter::<CategoryRegistration>()
            .any(|reg| reg.id == id)
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
