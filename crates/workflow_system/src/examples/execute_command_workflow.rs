//! Workflow for executing shell commands
//!
//! This workflow provides a safer alternative to the execute_command tool
//! by giving users explicit control over command execution with enhanced
//! visibility and confirmation.

use async_trait::async_trait;
use std::collections::HashMap;
use tokio::process::Command;

use crate::register_workflow;
use crate::types::{Parameter, Workflow, WorkflowDefinition, WorkflowError};

/// A workflow that executes shell commands with user confirmation
#[derive(Debug, Default)]
pub struct ExecuteCommandWorkflow;

#[async_trait]
impl Workflow for ExecuteCommandWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "execute_command".to_string(),
            description: "Executes a shell command with full visibility and control".to_string(),
            parameters: vec![
                Parameter {
                    name: "command".to_string(),
                    description: "The shell command to execute".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                Parameter {
                    name: "working_directory".to_string(),
                    description: "The working directory for command execution (optional)"
                        .to_string(),
                    required: false,
                    param_type: "string".to_string(),
                    default: None,
                },
            ],
            category: "system".to_string(),
            requires_approval: true,
            custom_prompt: Some(
                "⚠️ Command Execution\n\n\
                This will execute a shell command on your system.\n\
                Please review the command carefully before approving.\n\n\
                Security considerations:\n\
                - Commands have access to your filesystem\n\
                - Commands can access the network\n\
                - Commands run with your user permissions\n\n\
                Only approve commands you understand and trust."
                    .to_string(),
            ),
        }
    }

    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        let command = parameters
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                WorkflowError::InvalidParameters(
                    "command parameter is required and must be a string".to_string(),
                )
            })?;

        let working_directory = parameters.get("working_directory").and_then(|v| v.as_str());

        // Build the command
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(command);

        // Set working directory if provided
        if let Some(dir) = working_directory {
            cmd.current_dir(dir);
        }

        // Execute with timeout
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(300), // 5 minute timeout
            cmd.output(),
        )
        .await
        .map_err(|_| {
            WorkflowError::ExecutionFailed(
                "Command execution timed out after 5 minutes".to_string(),
            )
        })?
        .map_err(|e| WorkflowError::ExecutionFailed(format!("Failed to execute command: {}", e)))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        let success = output.status.success();

        Ok(serde_json::json!({
            "success": success,
            "exit_code": exit_code,
            "stdout": stdout,
            "stderr": stderr,
            "message": if success {
                "Command executed successfully"
            } else {
                "Command failed"
            }
        }))
    }
}

register_workflow!(ExecuteCommandWorkflow, "execute_command");
