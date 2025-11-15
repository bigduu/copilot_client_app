//! Tests for the ToolRegistry

use async_trait::async_trait;
use serde_json::json;
use std::sync::{Arc, RwLock};
use tool_system::{
    registry::{register_all_tools, ToolRegistry},
    types::{ToolArguments, ToolError, ToolPermission},
};

// Mock tool for testing
#[derive(Debug)]
struct MockTool {
    name: String,
}

impl MockTool {
    fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
        }
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
            category: Default::default(),
            tool_type: tool_system::types::ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: tool_system::types::DisplayPreference::Default,
            termination_behavior_doc: None,
            required_permissions: vec![],
        }
    }

    async fn execute(&self, _args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        Ok(json!({ "status": "success", "tool": self.name }))
    }
}

#[test]
fn test_tool_registry_creation() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    // Registry should be created successfully
    assert!(registry.list_tool_definitions().len() > 0);
}

#[test]
fn test_tool_registry_get_tool() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
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
    register_all_tools(&registry);
    let definitions = registry.list_tool_definitions();

    // Should have at least one tool registered
    assert!(
        !definitions.is_empty(),
        "Should have at least one registered tool"
    );

    // All definitions should have a name and description
    for def in &definitions {
        assert!(!def.name.is_empty(), "Tool definition should have a name");
        assert!(
            !def.description.is_empty(),
            "Tool definition should have a description"
        );
    }
}

#[tokio::test]
async fn test_registry_concurrent_access() {
    let registry = Arc::new(RwLock::new(ToolRegistry::new()));
    register_all_tools(&registry.write().unwrap());

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
    register_all_tools(&registry);
    // Default registry should work the same as new()
    assert!(registry.list_tool_definitions().len() > 0);
}

#[test]
fn test_filter_tools_by_permissions_read_only() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);

    // Filter with only ReadFiles permission
    let allowed = vec![ToolPermission::ReadFiles];
    
    // Get all tool definitions to check permissions directly
    let all_tools = registry.list_tool_definitions();
    
    // Verify read-only tools have ReadFiles permission
    let read_file_tool = all_tools.iter().find(|t| t.name == "read_file").unwrap();
    assert!(
        read_file_tool.required_permissions.contains(&ToolPermission::ReadFiles),
        "read_file should require ReadFiles permission"
    );
    assert!(
        read_file_tool.required_permissions.len() == 1,
        "read_file should only require ReadFiles permission"
    );
    
    let grep_tool = all_tools.iter().find(|t| t.name == "grep").unwrap();
    assert!(
        grep_tool.required_permissions.contains(&ToolPermission::ReadFiles),
        "grep should require ReadFiles permission"
    );
    
    // Now test the filter (note: most tools are hidden, so filtered list may be empty)
    let filtered = registry.filter_tools_by_permissions(&allowed);
    let tool_names: Vec<String> = filtered.iter().map(|t| t.name.clone()).collect();
    
    // Verify that any tools in the filtered list have correct permissions
    for tool in &filtered {
        assert!(
            tool.required_permissions.iter().all(|perm| allowed.contains(perm)),
            "All filtered tools should have permissions in allowed set"
        );
        assert!(
            !tool.hide_in_selector,
            "Filtered tools should not be hidden"
        );
    }
    
    // Verify write tools are NOT in filtered list (even if they weren't hidden)
    assert!(
        !tool_names.contains(&"create_file".to_string()),
        "Should NOT include create_file without WriteFiles permission"
    );
    assert!(
        !tool_names.contains(&"update_file".to_string()),
        "Should NOT include update_file without WriteFiles permission"
    );
    assert!(
        !tool_names.contains(&"replace_in_file".to_string()),
        "Should NOT include replace_in_file without WriteFiles permission"
    );
}

#[test]
fn test_filter_tools_by_permissions_write_access() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);

    // Filter with ReadFiles and WriteFiles permissions
    let allowed = vec![
        ToolPermission::ReadFiles,
        ToolPermission::WriteFiles,
        ToolPermission::CreateFiles,
        ToolPermission::DeleteFiles,
    ];
    
    // Get all tool definitions to verify permissions
    let all_tools = registry.list_tool_definitions();
    
    // Verify write tools have correct permissions
    let create_file_tool = all_tools.iter().find(|t| t.name == "create_file").unwrap();
    assert!(
        create_file_tool.required_permissions.contains(&ToolPermission::WriteFiles) ||
        create_file_tool.required_permissions.contains(&ToolPermission::CreateFiles),
        "create_file should require WriteFiles or CreateFiles permission"
    );
    
    let update_file_tool = all_tools.iter().find(|t| t.name == "update_file").unwrap();
    assert!(
        update_file_tool.required_permissions.contains(&ToolPermission::WriteFiles),
        "update_file should require WriteFiles permission"
    );
    
    // Test the filter
    let filtered = registry.filter_tools_by_permissions(&allowed);
    
    // Verify that any tools in the filtered list have correct permissions
    for tool in &filtered {
        assert!(
            tool.required_permissions.iter().all(|perm| allowed.contains(perm)),
            "All filtered tools should have permissions in allowed set"
        );
        assert!(
            !tool.hide_in_selector,
            "Filtered tools should not be hidden"
        );
    }
}

#[test]
fn test_filter_tools_by_permissions_hidden_tools() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);

    // Get all tools including hidden ones
    let all_tools = registry.list_tool_definitions();
    let hidden_tools: Vec<String> = all_tools
        .iter()
        .filter(|t| t.hide_in_selector)
        .map(|t| t.name.clone())
        .collect();

    // Filter with all permissions
    let allowed = vec![
        ToolPermission::ReadFiles,
        ToolPermission::WriteFiles,
        ToolPermission::CreateFiles,
        ToolPermission::DeleteFiles,
        ToolPermission::ExecuteCommands,
    ];
    let filtered = registry.filter_tools_by_permissions(&allowed);
    let filtered_names: Vec<String> = filtered.iter().map(|t| t.name.clone()).collect();

    // Hidden tools should NOT be in filtered results
    for hidden_tool in &hidden_tools {
        assert!(
            !filtered_names.contains(hidden_tool),
            "Hidden tool '{}' should not appear in filtered results",
            hidden_tool
        );
    }
}

#[test]
fn test_filter_tools_by_permissions_empty_permissions() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);

    // Filter with no permissions
    let allowed = vec![];
    let filtered = registry.filter_tools_by_permissions(&allowed);

    // Should return empty or only tools with no required permissions
    for tool in &filtered {
        assert!(
            tool.required_permissions.is_empty(),
            "Tool '{}' should have no required permissions",
            tool.name
        );
    }
}

#[test]
fn test_filter_tools_by_permissions_partial_match() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);

    // Tools requiring multiple permissions should only appear if ALL are present
    let allowed = vec![ToolPermission::ReadFiles]; // Missing WriteFiles
    let filtered = registry.filter_tools_by_permissions(&allowed);
    let tool_names: Vec<String> = filtered.iter().map(|t| t.name.clone()).collect();

    // Tools requiring both ReadFiles and WriteFiles should NOT appear
    assert!(
        !tool_names.contains(&"update_file".to_string()),
        "update_file requires WriteFiles, should not appear with only ReadFiles"
    );
    assert!(
        !tool_names.contains(&"replace_in_file".to_string()),
        "replace_in_file requires WriteFiles, should not appear with only ReadFiles"
    );
}
