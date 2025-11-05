//! Simple echo workflow for testing

use async_trait::async_trait;
use std::collections::HashMap;

use crate::register_workflow;
use crate::types::{Parameter, Workflow, WorkflowDefinition, WorkflowError};

/// A simple workflow that echoes back the input message
#[derive(Debug, Default)]
pub struct EchoWorkflow;

#[async_trait]
impl Workflow for EchoWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "echo".to_string(),
            description: "Echoes back the provided message".to_string(),
            parameters: vec![Parameter {
                name: "message".to_string(),
                description: "The message to echo back".to_string(),
                required: true,
                param_type: "string".to_string(),
                default: None,
            }],
            category: "general".to_string(),
            requires_approval: false, // Workflows are user-invoked, no approval needed
            custom_prompt: None,
        }
    }

    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        let message = parameters
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                WorkflowError::InvalidParameters(
                    "message parameter is required and must be a string".to_string(),
                )
            })?;

        Ok(serde_json::json!({
            "success": true,
            "echo": message
        }))
    }
}

register_workflow!(EchoWorkflow, "echo");
