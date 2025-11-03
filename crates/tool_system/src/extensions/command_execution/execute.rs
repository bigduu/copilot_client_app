use crate::{
    registry::macros::auto_register_tool,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType, ToolPermission,
    },
};
use async_trait::async_trait;
use serde_json::json;

// Command execution tool
// ⚠️ DEPRECATED: Use ExecuteCommandWorkflow instead for safer command execution
// This tool will be removed in a future version.
#[derive(Debug)]
pub struct ExecuteCommandTool;

impl ExecuteCommandTool {
    pub const TOOL_NAME: &'static str = "execute_command";

    pub fn new() -> Self {
        Self
    }
}

impl Default for ExecuteCommandTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ExecuteCommandTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Executes a shell command and returns the output".to_string(),
            parameters: vec![Parameter {
                name: "command".to_string(),
                description: "The shell command to execute".to_string(),
                required: true,
            }],
            requires_approval: true,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: Some(r#"You are a command parameter parser. Your task is to extract the shell command from user input.

RULES:
- The user input is the command they want to execute
- Return ONLY the command string, nothing else
- Do NOT add explanations, quotes, or formatting
- Do NOT provide safety warnings

User wants to execute: "{{user_description}}"

Command:"#.to_string()),
            hide_in_selector: false,
            display_preference: DisplayPreference::Hidden,
            termination_behavior_doc: Some("Use terminate=true after executing commands, as they typically represent final actions. Use terminate=false only if you need to analyze the command output before responding.".to_string()),
            required_permissions: vec![ToolPermission::ExecuteCommands],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let command = match args {
            ToolArguments::String(command) => command,
            ToolArguments::Json(json) => json
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ToolError::InvalidArguments("Missing command".to_string()))?
                .to_string(),
            _ => return Err(ToolError::InvalidArguments("Expected a single string command or a JSON object with a command".to_string())),
        };

        // Execute the command
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&command)
            .output()
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if output.status.success() {
            if stdout.is_empty() {
                Ok(json!({
                    "status": "success",
                    "message": "Command executed successfully (no output)"
                }))
            } else {
                Ok(json!({
                    "status": "success",
                    "stdout": stdout
                }))
            }
        } else {
            let error_msg = if stderr.is_empty() {
                format!("Command failed with exit code: {}", output.status)
            } else {
                stderr
            };
            Err(ToolError::ExecutionFailed(error_msg))
        }
    }
}

// Auto-register the tool
auto_register_tool!(ExecuteCommandTool);
