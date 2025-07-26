//! Simple test to verify auto registration system works

use crate::tools::{create_tool_manager, AutoToolRegistry};

pub fn test_auto_registry() {
    println!("Testing auto registration system...");
    
    // Test tool registration
    let tool_names = AutoToolRegistry::get_tool_names();
    println!("Registered tools: {:?}", tool_names);
    
    // Test category registration  
    let category_ids = AutoToolRegistry::get_category_ids();
    println!("Registered categories: {:?}", category_ids);
    
    // Test tool manager creation
    match create_tool_manager() {
        Ok(manager) => {
            let categories = manager.get_enabled_categories();
            println!("Tool manager created successfully with {} categories", categories.len());
            for category in categories {
                println!("  - Category: {} ({})", category.name, category.id);
            }
        }
        Err(e) => {
            println!("Failed to create tool manager: {:?}", e);
        }
    }
}
