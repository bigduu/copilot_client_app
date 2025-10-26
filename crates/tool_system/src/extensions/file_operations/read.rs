use crate::{
    registry::macros::auto_register_tool,
    types::{
        Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType, DisplayPreference,
    },
};
use async_trait::async_trait;
use serde_json::json;
use tokio::fs as tokio_fs;

// File reading tool (supports partial reading)
#[derive(Debug)]
pub struct ReadFileTool;

impl ReadFileTool {
    pub const TOOL_NAME: &'static str = "read_file";

    pub fn new() -> Self {
        Self
    }
}

impl Default for ReadFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ReadFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Reads the content of a file, optionally a specific range".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to read".to_string(),
                    required: true,
                },
                Parameter {
                    name: "start_line".to_string(),
                    description: "The line number to start reading from (1-based, optional)"
                        .to_string(),
                    required: false,
                },
                Parameter {
                    name: "end_line".to_string(),
                    description: "The line number to end reading at (1-based, optional)"
                        .to_string(),
                    required: false,
                },
            ],
            requires_approval: false,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (path, start_line, end_line) = match args {
            ToolArguments::Json(json) => {
                let path = json
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing path".to_string()))?
                    .to_string();
                let start_line = json
                    .get("start_line")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<usize>().ok());
                let end_line = json
                    .get("end_line")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<usize>().ok());
                (path, start_line, end_line)
            }
            ToolArguments::String(path) => (path, None, None),
            _ => return Err(ToolError::InvalidArguments("Expected a single string path or a JSON object".to_string())),
        };

        // Read the file
        let content = tokio_fs::read_to_string(&path)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        // If no range is specified, return the entire file
        if start_line.is_none() && end_line.is_none() {
            return Ok(json!({ "content": content }));
        }

        // Extract the specified range
        let lines: Vec<&str> = content.lines().collect();
        let start = start_line.unwrap_or(1).saturating_sub(1); // Convert to 0-based index
        let end = end_line.unwrap_or(lines.len());

        if start >= lines.len() {
            return Err(ToolError::InvalidArguments("Start line exceeds file length".to_string()));
        }

        let end = end.min(lines.len());
        let selected_lines = lines[start..end].join("\n");

        Ok(json!({
            "status": "success",
            "message": format!("Lines {}-{} of file {}:\n{}", start + 1, end, path, selected_lines)
        }))
    }
}

// Auto-register the tool
auto_register_tool!(ReadFileTool);
