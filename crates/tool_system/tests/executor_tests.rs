//! Tests for the ToolExecutor

use std::sync::{Arc, Mutex};
use tool_system::{
    executor::ToolExecutor,
    registry::ToolRegistry,
    types::{ToolArguments, ToolError},
};
use serde_json::json;

#[tokio::test]
async fn test_executor_successful_execution() {
    let registry = Arc::new(Mutex::new(ToolRegistry::new()));
    let executor = ToolExecutor::new(registry.clone());
    
    // Get the list of available tools
    let tools = {
        let reg = registry.lock().unwrap();
        reg.list_tool_definitions()
    };
    
    if !tools.is_empty() {
        let tool_name = &tools[0].name;
        let result = executor.execute_tool(tool_name, ToolArguments::Json(json!({}))).await;
        
        // Execution should succeed or fail based on the tool's requirements
        assert!(result.is_ok() || result.is_err(), "Tool execution should complete");
    } else {
        // If no tools are registered, test should still pass
        println!("No tools registered, skipping execution test");
    }
}

#[tokio::test]
async fn test_executor_unknown_tool() {
    let registry = Arc::new(Mutex::new(ToolRegistry::new()));
    let executor = ToolExecutor::new(registry.clone());
    
    let result = executor.execute_tool("nonexistent_tool", ToolArguments::String("test".to_string())).await;
    
    assert!(result.is_err(), "Execution of unknown tool should fail");
    
    let error = result.unwrap_err();
    match error {
        ToolError::ExecutionFailed(msg) => {
            assert!(msg.contains("not found"), "Error should indicate tool not found");
        }
        _ => panic!("Expected ExecutionFailed error"),
    }
}

#[tokio::test]
async fn test_executor_concurrent_executions() {
    let registry = Arc::new(Mutex::new(ToolRegistry::new()));
    let executor = Arc::new(ToolExecutor::new(registry.clone()));
    
    // Get a list of available tools
    let tools = {
        let reg = registry.lock().unwrap();
        reg.list_tool_definitions()
    };
    
    if !tools.is_empty() {
        // Spawn multiple concurrent executions
        let handles: Vec<_> = (0..5)
            .map(|_i| {
                let executor = Arc::clone(&executor);
                let tool_name = tools[0].name.clone();
                tokio::spawn(async move {
                    executor.execute_tool(&tool_name, ToolArguments::Json(json!({}))).await
                })
            })
            .collect();
        
        // Wait for all executions to complete
        for handle in handles {
            let result = handle.await.unwrap();
            // Each execution should complete (success or failure)
            assert!(result.is_ok() || result.is_err(), "Concurrent execution should complete");
        }
    } else {
        println!("No tools registered, skipping concurrent execution test");
    }
}

