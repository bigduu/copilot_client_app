use crate::{
    registry::macros::auto_register_tool,
    types::{
        Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType, DisplayPreference, ToolPermission,
    },
};
use async_trait::async_trait;
use serde_json::json;
use tokio::fs as tokio_fs;

// File update tool
#[derive(Debug)]
pub struct UpdateFileTool;

impl UpdateFileTool {
    pub const TOOL_NAME: &'static str = "update_file";

    pub fn new() -> Self {
        Self
    }
}

impl Default for UpdateFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for UpdateFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Updates the content of an existing file".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to update".to_string(),
                    required: true,
                },
                Parameter {
                    name: "content".to_string(),
                    description: "The new content for the file".to_string(),
                    required: true,
                },
            ],
            requires_approval: true,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some("Use terminate=true after updating files. Use terminate=false if you need to verify the changes or perform additional file operations.".to_string()),
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

        // Update the file
        tokio_fs::write(&path, content)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(json!({
            "status": "success",
            "message": format!("File updated successfully: {}", path)
        }))
    }
}

// Auto-register the tool
auto_register_tool!(UpdateFileTool);
