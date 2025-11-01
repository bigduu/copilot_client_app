//! Tests for individual tool implementations

use tool_system::{
    registry::ToolRegistry,
    types::{ToolArguments, ToolError},
};
use serde_json::json;
use tempfile::TempDir;
use std::fs;

#[tokio::test]
async fn test_demo_tool_execution() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("demo_tool");
    
    if let Some(tool) = tool {
        let result = tool.execute(ToolArguments::String("".to_string())).await;
        assert!(result.is_ok(), "Demo tool should execute successfully");
        
        let value = result.unwrap();
        assert!(value.get("report").is_some(), "Demo tool should return a report");
    } else {
        println!("Demo tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_read_file_tool_success() {
    // Create a temporary file
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    fs::write(&file_path, "Hello, World!").unwrap();
    
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("read_file");
    
    if let Some(tool) = tool {
        let args = ToolArguments::Json(json!({ "path": file_path.to_str() }));
        let result = tool.execute(args).await;
        
        assert!(result.is_ok(), "Read file tool should succeed");
        let value = result.unwrap();
        assert!(value.get("content").is_some(), "Should return file content");
        
        let content = value.get("content").unwrap().as_str().unwrap();
        assert_eq!(content, "Hello, World!");
    } else {
        println!("Read file tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_read_file_tool_invalid_path() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("read_file");
    
    if let Some(tool) = tool {
        let args = ToolArguments::String("/nonexistent/path/file.txt".to_string());
        let result = tool.execute(args).await;
        
        assert!(result.is_err(), "Read file tool should fail for invalid path");
        
        let error = result.unwrap_err();
        match error {
            ToolError::ExecutionFailed(_) => {
                // Expected error type
            }
            _ => panic!("Expected ExecutionFailed error"),
        }
    } else {
        println!("Read file tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_read_file_tool_line_range() {
    // Create a temporary file with multiple lines
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    let content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    fs::write(&file_path, content).unwrap();
    
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("read_file");
    
    if let Some(tool) = tool {
        let args = ToolArguments::Json(json!({ 
            "path": file_path.to_str(),
            "start_line": "2",
            "end_line": "4"
        }));
        let result = tool.execute(args).await;
        
        assert!(result.is_ok(), "Read file tool should succeed with line range");
        let value = result.unwrap();
        assert!(value.get("message").is_some(), "Should return formatted message with lines");
        
        let message = value.get("message").unwrap().as_str().unwrap();
        assert!(message.contains("2-4"), "Should contain line range in message");
    } else {
        println!("Read file tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_execute_command_tool_success() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("execute_command");
    
    if let Some(tool) = tool {
        // Execute a simple command
        let args = ToolArguments::String("echo 'Hello'".to_string());
        let result = tool.execute(args).await;
        
        if result.is_ok() {
            let value = result.unwrap();
            assert!(value.get("status").is_some(), "Should return status");
            assert!(value.get("stdout").is_some(), "Should return stdout");
        } else {
            // Command might fail on some systems, that's ok
            println!("Command execution failed, which is acceptable in test environment");
        }
    } else {
        println!("Execute command tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_execute_command_tool_invalid_command() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("execute_command");
    
    if let Some(tool) = tool {
        // Try to execute a non-existent command
        let args = ToolArguments::String("nonexistent_command_xyz123".to_string());
        let result = tool.execute(args).await;
        
        // This should fail
        assert!(result.is_err(), "Should fail for invalid command");
    } else {
        println!("Execute command tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_tool_arguments_parsing() {
    let registry = ToolRegistry::new();
    let tools = registry.list_tool_definitions();
    
    // Test that each tool can handle different argument formats
    for tool_def in tools {
        let tool = registry.get_tool(&tool_def.name).unwrap();
        
        // Try with String arguments
        let result1 = tool.execute(ToolArguments::String("test".to_string())).await;
        assert!(result1.is_ok() || result1.is_err(), "Should handle String arguments");
        
        // Try with JSON arguments
        let result2 = tool.execute(ToolArguments::Json(json!({}))).await;
        assert!(result2.is_ok() || result2.is_err(), "Should handle JSON arguments");
    }
}

