//! Tests for the ToolRegistry

use std::sync::{Arc, RwLock};
use tool_system::{
    registry::ToolRegistry,
    types::{ToolArguments, ToolError},
};
use async_trait::async_trait;
use serde_json::json;

// Mock tool for testing
#[derive(Debug)]
struct MockTool {
    name: String,
}

impl MockTool {
    fn new(name: &str) -> Self {
        Self { name: name.to_string() }
    }
}

#[async_trait]
impl tool_system::types::Tool for MockTool {
    fn definition(&self) -> tool_system::types::ToolDefinition {
        tool_system::types::ToolDefinition {
            name: self.name.clone(),
            description: format!("Mock tool {}", self.name),
            parameters: vec![],
            requires_approval: false,
            tool_type: tool_system::types::ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: tool_system::types::DisplayPreference::Default,
            termination_behavior_doc: None,
        }
    }

    async fn execute(&self, _args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        Ok(json!({ "status": "success", "tool": self.name }))
    }
}

#[test]
fn test_tool_registry_creation() {
    let registry = ToolRegistry::new();
    // Registry should be created successfully
    assert!(registry.list_tool_definitions().len() > 0);
}

#[test]
fn test_tool_registry_get_tool() {
    let registry = ToolRegistry::new();
    // Try to get a registered tool (assuming some tools are registered)
    let tools = registry.list_tool_definitions();
    
    if !tools.is_empty() {
        let tool_name = &tools[0].name;
        let tool = registry.get_tool(tool_name);
        assert!(tool.is_some(), "Tool should be found");
        
        let definition = tool.unwrap().definition();
        assert_eq!(definition.name, *tool_name);
    }
}

#[test]
fn test_tool_registry_get_unknown_tool() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("nonexistent_tool");
    assert!(tool.is_none(), "Unknown tool should return None");
}

#[test]
fn test_list_tool_definitions() {
    let registry = ToolRegistry::new();
    let definitions = registry.list_tool_definitions();
    
    // Should have at least one tool registered
    assert!(!definitions.is_empty(), "Should have at least one registered tool");
    
    // All definitions should have a name and description
    for def in &definitions {
        assert!(!def.name.is_empty(), "Tool definition should have a name");
        assert!(!def.description.is_empty(), "Tool definition should have a description");
    }
}

#[tokio::test]
async fn test_registry_concurrent_access() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    
    // Spawn multiple tasks to access the registry concurrently
    let handles: Vec<_> = (0..10)
        .map(|i| {
            let registry = Arc::clone(&registry);
            tokio::spawn(async move {
                let registry = registry.read().unwrap();
                let tools = registry.list_tool_definitions();
                format!("Task {}: {} tools", i, tools.len())
            })
        })
        .collect();
    
    // Wait for all tasks to complete
    for handle in handles {
        let result = handle.await.unwrap();
        assert!(result.contains("tools"));
    }
}

#[test]
fn test_registry_default() {
    let registry = ToolRegistry::default();
    // Default registry should work the same as new()
    assert!(registry.list_tool_definitions().len() > 0);
}

