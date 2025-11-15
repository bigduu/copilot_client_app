//! Tests for ToolFactory trait and behavior

use std::sync::Arc;
use tool_system::{
    extensions::{
        file_operations::ReadFileTool,
        search::{GrepSearchTool, GlobSearchTool},
    },
    registry::{ToolFactory, ToolRegistry},
};

#[test]
fn test_tool_factory_tool_name() {
    let factory = Arc::new(ReadFileTool::new());
    assert_eq!(factory.tool_name(), "read_file");
    
    let grep_factory = Arc::new(GrepSearchTool::new());
    assert_eq!(grep_factory.tool_name(), "grep");
    
    let glob_factory = Arc::new(GlobSearchTool::new());
    assert_eq!(glob_factory.tool_name(), "glob");
}

#[test]
fn test_tool_factory_create() {
    let factory = Arc::new(ReadFileTool::new());
    let tool = factory.create();
    
    assert!(tool.definition().name == "read_file");
    assert!(!tool.definition().description.is_empty());
}

#[test]
fn test_tool_factory_is_singleton() {
    let factory = Arc::new(ReadFileTool::new());
    // Default should be singleton (true)
    assert!(factory.is_singleton());
}

#[test]
fn test_tool_factory_registry_integration() {
    let registry = ToolRegistry::new();
    
    // Register a factory
    let factory = Arc::new(ReadFileTool::new());
    registry.register_factory(factory);
    
    // Should be able to get the tool
    let tool = registry.get_tool("read_file");
    assert!(tool.is_some());
    
    // Should get the same instance (singleton)
    let tool1 = registry.get_tool("read_file").unwrap();
    let tool2 = registry.get_tool("read_file").unwrap();
    
    // Both should have the same definition
    assert_eq!(tool1.definition().name, tool2.definition().name);
}

#[test]
fn test_tool_factory_multiple_tools() {
    let registry = ToolRegistry::new();
    
    // Register multiple factories
    registry.register_factory(Arc::new(ReadFileTool::new()));
    registry.register_factory(Arc::new(GrepSearchTool::new()));
    registry.register_factory(Arc::new(GlobSearchTool::new()));
    
    // All should be accessible
    assert!(registry.get_tool("read_file").is_some());
    assert!(registry.get_tool("grep").is_some());
    assert!(registry.get_tool("glob").is_some());
    
    // Each should have correct name
    assert_eq!(registry.get_tool("read_file").unwrap().definition().name, "read_file");
    assert_eq!(registry.get_tool("grep").unwrap().definition().name, "grep");
    assert_eq!(registry.get_tool("glob").unwrap().definition().name, "glob");
}

