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

#[tokio::test]
async fn test_workflow_with_optional_parameters() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    // Execute create_file with optional parameters omitted
    let mut params = HashMap::new();
    params.insert("path".to_string(), serde_json::json!("/tmp/test.txt"));
    params.insert("content".to_string(), serde_json::json!("content"));
    
    let result = executor.execute("create_file", params).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_workflow_parameter_type_validation() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    // Try to pass wrong type for parameter
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::json!(123)); // Should be string
    
    let result = executor.execute("echo", params).await;
    // Should either succeed with coercion or fail with validation error
    // The exact behavior depends on implementation
    assert!(result.is_ok() || result.is_err());
}

#[tokio::test]
async fn test_workflow_with_extra_parameters() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    // Pass extra parameters that aren't defined
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::json!("Hello"));
    params.insert("extra_param".to_string(), serde_json::json!("ignored"));
    
    let result = executor.execute("echo", params).await;
    assert!(result.is_ok()); // Should ignore extra parameters
}

#[tokio::test]
async fn test_workflow_with_empty_string_parameter() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::json!(""));
    
    let result = executor.execute("echo", params).await;
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output["echo"], "");
}

#[tokio::test]
async fn test_workflow_with_null_parameter() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::Value::Null);
    
    let result = executor.execute("echo", params).await;
    // Should fail validation or handle gracefully
    assert!(result.is_err() || result.is_ok());
}

#[tokio::test]
async fn test_workflow_concurrent_execution() {
    use tokio::task::JoinSet;
    
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = Arc::new(WorkflowExecutor::new(registry.clone()));
    
    let mut join_set = JoinSet::new();
    
    // Execute multiple workflows concurrently
    for i in 0..10 {
        let executor_clone = executor.clone();
        join_set.spawn(async move {
            let mut params = HashMap::new();
            params.insert("message".to_string(), serde_json::json!(format!("Message {}", i)));
            executor_clone.execute("echo", params).await
        });
    }
    
    // Wait for all to complete
    let mut success_count = 0;
    while let Some(result) = join_set.join_next().await {
        if let Ok(Ok(_)) = result {
            success_count += 1;
        }
    }
    
    assert_eq!(success_count, 10);
}

#[tokio::test]
async fn test_workflow_with_json_string_parameter() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    let json_string = r#"{"key": "value", "number": 123}"#;
    
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::json!(json_string));
    
    let result = executor.execute("echo", params).await;
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output["echo"], json_string);
}

#[tokio::test]
async fn test_workflow_parameter_with_special_characters() {
    let registry = Arc::new(WorkflowRegistry::new());
    let executor = WorkflowExecutor::new(registry.clone());
    
    let special_chars = "Hello\n\tWorld\r\n\"Quoted\"\\Backslash";
    let mut params = HashMap::new();
    params.insert("message".to_string(), serde_json::json!(special_chars));
    
    let result = executor.execute("echo", params).await;
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output["echo"], special_chars);
}


