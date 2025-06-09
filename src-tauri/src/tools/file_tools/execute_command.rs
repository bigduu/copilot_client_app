use crate::tools::{Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;

// 命令执行工具
#[derive(Debug)]
pub struct ExecuteCommandTool;

#[async_trait]
impl Tool for ExecuteCommandTool {
    fn name(&self) -> String {
        "execute_command".to_string()
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

        // Prepare the output
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        Ok(format!(
            "Command: {}\nExit code: {}\nStdout:\n{}\nStderr:\n{}",
            command, exit_code, stdout, stderr
        ))
    }
}
