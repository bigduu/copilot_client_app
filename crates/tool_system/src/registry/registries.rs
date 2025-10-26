//! Global registration tables for tools and categories

use inventory;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::types::{Tool, Category, ToolDefinition};

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

/// A thread-safe, caching registry for all tools.
#[derive(Debug)]
pub struct ToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn Tool>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        let tools = inventory::iter::<ToolRegistration>()
            .map(|reg| (reg.name.to_string(), (reg.constructor)()))
            .collect();
        Self {
            tools: RwLock::new(tools),
        }
    }

    pub fn get_tool(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.read().unwrap().get(name).cloned()
    }

    pub fn list_tool_definitions(&self) -> Vec<ToolDefinition> {
        self.tools
            .read()
            .unwrap()
            .values()
            .map(|tool| tool.definition())
            .collect()
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
