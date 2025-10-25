use crate::{
    registry::macros::auto_register_tool,
    types::{DisplayPreference, Parameter, Tool, ToolType},
};
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

impl Default for ExecuteCommandTool {
    fn default() -> Self {
        Self::new()
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

    fn display_preference(&self) -> DisplayPreference {
        DisplayPreference::Hidden
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

    fn hide_in_selector(&self) -> bool {
        false
    }

    fn get_ai_prompt_template(&self) -> Option<String> {
        let parameters_desc = self
            .parameters()
            .iter()
            .map(|p| {
                format!(
                    "- {}: {} ({})",
                    p.name,
                    p.description,
                    if p.required { "required" } else { "optional" }
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        let template = format!(
            r#"You are a command parameter parser. Your task is to extract the shell command from user input.

Tool: {}
Description: {}
Parameters:
{}

RULES:
- The user input is the command they want to execute
- Return ONLY the command string, nothing else
- Do NOT add explanations, quotes, or formatting
- Do NOT provide safety warnings

User wants to execute: "{{user_description}}"

Command:"#,
            self.name(),
            self.description(),
            parameters_desc
        );

        Some(template)
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
