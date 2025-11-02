use crate::{
    registry::macros::auto_register_tool,
    types::{
        Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType, DisplayPreference, ToolPermission,
    },
};
use async_trait::async_trait;
use serde_json::json;
use tokio::fs as tokio_fs;

// File append tool
#[derive(Debug)]
pub struct AppendFileTool;

impl AppendFileTool {
    pub const TOOL_NAME: &'static str = "append_file";

    pub fn new() -> Self {
        Self
    }
}

impl Default for AppendFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for AppendFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Appends content to the end of a file".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to append to".to_string(),
                    required: true,
                },
                Parameter {
                    name: "content".to_string(),
                    description: "The content to append to the file".to_string(),
                    required: true,
                },
            ],
            requires_approval: true,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some("Use terminate=true after appending to files. Use terminate=false if appending to multiple files or need to verify the result.".to_string()),
            required_permissions: vec![ToolPermission::ReadFiles, ToolPermission::WriteFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (path, content) = match args {
            ToolArguments::Json(json) => {
                let path = json
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing path".to_string()))?;
                let content = json
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing content".to_string()))?;
                (path.to_string(), content.to_string())
            }
            _ => return Err(ToolError::InvalidArguments("Expected JSON object with path and content".to_string())),
        };

        // Read existing content
        let existing_content = if tokio_fs::metadata(&path).await.is_ok() {
            tokio_fs::read_to_string(&path).await.unwrap_or_default()
        } else {
            String::new()
        };

        // Append new content
        let new_content = if existing_content.is_empty() {
            content
        } else {
            format!("{}\n{}", existing_content, content)
        };

        // Write back to file
        tokio_fs::write(&path, new_content)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(json!({
            "status": "success",
            "message": format!("Content appended successfully to: {}", path)
        }))
    }
}

// Auto-register the tool
auto_register_tool!(AppendFileTool);
