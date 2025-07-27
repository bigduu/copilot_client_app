use crate::extension_system::{auto_register_tool, Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;

// Command execution tool
#[derive(Debug)]
pub struct ExecuteCommandTool;

impl ExecuteCommandTool {
    pub const TOOL_NAME: &'static str = "execute_command";

    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for ExecuteCommandTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "Executes a shell command and returns the output".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "command".to_string(),
            description: "The shell command to execute".to_string(),
            required: true,
            value: "".to_string(),
        }]
    }

    fn required_approval(&self) -> bool {
        true
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut command = String::new();

        for param in parameters {
            if param.name == "command" {
                command = param.value;
            }
        }

        if command.is_empty() {
            return Err(anyhow::anyhow!("Command parameter is required"));
        }

        // Execute the command
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&command)
            .output()
            .await
            .with_context(|| format!("Failed to execute command: {}", command))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            if stdout.is_empty() {
                Ok("Command executed successfully (no output)".to_string())
            } else {
                Ok(format!("Command output:\n{}", stdout))
            }
        } else {
            let error_msg = if stderr.is_empty() {
                format!("Command failed with exit code: {}", output.status)
            } else {
                format!("Command failed:\n{}", stderr)
            };
            Err(anyhow::anyhow!(error_msg))
        }
    }
}

// Auto-register the tool
auto_register_tool!(ExecuteCommandTool);
