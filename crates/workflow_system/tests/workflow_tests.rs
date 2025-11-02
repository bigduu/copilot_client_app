//! Integration tests for workflow system

use std::collections::HashMap;
use std::sync::Arc;
use workflow_system::{WorkflowRegistry, WorkflowExecutor};

#[tokio::test]
async fn test_echo_workflow_execution() {
    // Initialize registry (this will automatically register all workflows)
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    // Prepare parameters
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::json!("Hello, World!"));
    
    // Execute the echo workflow
    let result = executor.execute("echo", params).await;
    
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output["success"], true);
    assert_eq!(output["echo"], "Hello, World!");
}

#[tokio::test]
async fn test_create_file_workflow() {
    use tempfile::tempdir;
    use tokio::fs;
    
    // Create a temporary directory for testing
    let temp_dir = tempdir().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    let file_path_str = file_path.to_str().unwrap();
    
    // Initialize registry and executor
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    // Prepare parameters
    let mut params = HashMap::new();
    params.insert("path".to_string(), serde_json::json!(file_path_str));
    params.insert("content".to_string(), serde_json::json!("Test content"));
    
    // Execute the create_file workflow
    let result = executor.execute("create_file", params).await;
    
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output["success"], true);
    
    // Verify the file was created
    let file_content = fs::read_to_string(&file_path).await.unwrap();
    assert_eq!(file_content, "Test content");
}

#[tokio::test]
async fn test_workflow_not_found() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    let params = HashMap::new();
    let result = executor.execute("nonexistent_workflow", params).await;
    
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("not found"));
}

#[tokio::test]
async fn test_missing_required_parameter() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    // Try to execute echo workflow without the required "message" parameter
    let params = HashMap::new();
    let result = executor.execute("echo", params).await;
    
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("message"));
}

#[tokio::test]
async fn test_list_workflows() {
    let registry = Arc::new(WorkflowRegistry::new());
    
    let workflows = registry.list_workflow_definitions();
    assert!(workflows.len() >= 2); // At least echo and create_file
    
    let workflow_names: Vec<String> = workflows.iter().map(|w| w.name.clone()).collect();
    assert!(workflow_names.contains(&"echo".to_string()));
    assert!(workflow_names.contains(&"create_file".to_string()));
}


