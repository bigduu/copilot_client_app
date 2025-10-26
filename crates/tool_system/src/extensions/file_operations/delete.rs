use crate::{
    registry::macros::auto_register_tool,
    types::{
        Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType, DisplayPreference,
    },
};
use async_trait::async_trait;
use serde_json::json;
use tokio::fs as tokio_fs;

// File deletion tool
#[derive(Debug)]
pub struct DeleteFileTool;

impl DeleteFileTool {
    pub const TOOL_NAME: &'static str = "delete_file";

    pub fn new() -> Self {
        Self
    }
}

impl Default for DeleteFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for DeleteFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Deletes a file from the filesystem".to_string(),
            parameters: vec![Parameter {
                name: "path".to_string(),
                description: "The path of the file to delete".to_string(),
                required: true,
            }],
            requires_approval: true,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let path = match args {
            ToolArguments::String(path) => path,
            ToolArguments::Json(json) => json
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ToolError::InvalidArguments("Missing path".to_string()))?
                .to_string(),
            _ => return Err(ToolError::InvalidArguments("Expected a single string path or a JSON object with a path".to_string())),
        };

        // Delete the file
        tokio_fs::remove_file(&path)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(json!({
            "status": "success",
            "message": format!("File deleted successfully: {}", path)
        }))
    }
}

// Auto-register the tool
auto_register_tool!(DeleteFileTool);
