//! Workflow for creating files with content

use async_trait::async_trait;
use std::collections::HashMap;
use tokio::fs;

use crate::register_workflow;
use crate::types::{Parameter, Workflow, WorkflowDefinition, WorkflowError};

/// A workflow that creates a file with the specified content
#[derive(Debug, Default)]
pub struct CreateFileWorkflow;

#[async_trait]
impl Workflow for CreateFileWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "create_file".to_string(),
            description: "Creates a new file with the specified content".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path where the file should be created".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                Parameter {
                    name: "content".to_string(),
                    description: "The content to write to the file".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: Some("".to_string()),
                }
            ],
            category: "file_operations".to_string(),
            requires_approval: true,
            custom_prompt: Some("This workflow will create a new file. Please review the path and content before approving.".to_string()),
        }
    }

    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                WorkflowError::InvalidParameters(
                    "path parameter is required and must be a string".to_string(),
                )
            })?;

        let content = parameters
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Write the file
        fs::write(path, content)
            .await
            .map_err(|e| WorkflowError::ExecutionFailed(format!("Failed to write file: {}", e)))?;

        Ok(serde_json::json!({
            "success": true,
            "path": path,
            "message": format!("File created successfully at {}", path)
        }))
    }
}

register_workflow!(CreateFileWorkflow, "create_file");






