//! Workflow for deleting files
//!
//! This workflow provides a safer alternative to the delete_file tool
//! by giving users explicit control over file deletion with confirmation.

use async_trait::async_trait;
use std::collections::HashMap;
use tokio::fs;

use crate::types::{Parameter, Workflow, WorkflowDefinition, WorkflowError};
use crate::register_workflow;

/// A workflow that deletes a file with user confirmation
#[derive(Debug, Default)]
pub struct DeleteFileWorkflow;

#[async_trait]
impl Workflow for DeleteFileWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "delete_file".to_string(),
            description: "Deletes a file from the filesystem (requires confirmation)".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to delete".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                Parameter {
                    name: "confirm".to_string(),
                    description: "Type 'DELETE' to confirm deletion".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                }
            ],
            category: "file_operations".to_string(),
            requires_approval: true,
            custom_prompt: Some(
                "⚠️ File Deletion\n\n\
                This will permanently delete the specified file.\n\
                This action cannot be undone.\n\n\
                Please review the file path carefully before approving."
                .to_string()
            ),
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
                    "path parameter is required and must be a string".to_string()
                )
            })?;
        
        let confirm = parameters
            .get("confirm")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        
        // Require explicit confirmation
        if confirm != "DELETE" {
            return Err(WorkflowError::InvalidParameters(
                "Deletion not confirmed. Please type 'DELETE' to confirm.".to_string()
            ));
        }
        
        // Check if file exists
        if !fs::metadata(path).await.is_ok() {
            return Err(WorkflowError::InvalidParameters(
                format!("File does not exist: {}", path)
            ));
        }
        
        // Delete the file
        fs::remove_file(path)
            .await
            .map_err(|e| WorkflowError::ExecutionFailed(format!("Failed to delete file: {}", e)))?;
        
        Ok(serde_json::json!({
            "success": true,
            "path": path,
            "message": format!("File deleted successfully: {}", path)
        }))
    }
}

register_workflow!(DeleteFileWorkflow, "delete_file");

