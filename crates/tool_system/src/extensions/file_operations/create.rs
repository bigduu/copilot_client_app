use crate::{
    impl_tool_factory,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError,
        ToolPermission, ToolType,
    },
};
use async_trait::async_trait;
use serde_json::json;
use std::path::Path;
use tokio::fs as tokio_fs;

// File creation tool
#[derive(Debug)]
pub struct CreateFileTool;

impl CreateFileTool {
    pub const TOOL_NAME: &'static str = "create_file";

    pub fn new() -> Self {
        Self
    }
}

impl Default for CreateFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for CreateFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Creates a new file with the specified content".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to create".to_string(),
                    required: true,
                },
                Parameter {
                    name: "content".to_string(),
                    description: "The content to write to the file".to_string(),
                    required: true,
                },
            ],
            requires_approval: true,
            category: crate::types::tool_category::ToolCategory::FileWriting,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some("Use terminate=true after creating files unless you need to perform additional operations. Use terminate=false if creating multiple related files or need to verify the result.".to_string()),
            required_permissions: vec![ToolPermission::WriteFiles, ToolPermission::CreateFiles],
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
            _ => {
                return Err(ToolError::InvalidArguments(
                    "Expected JSON object with path and content".to_string(),
                ))
            }
        };

        // Create parent directories if they don't exist
        if let Some(parent) = Path::new(&path).parent() {
            if !parent.exists() {
                tokio_fs::create_dir_all(parent)
                    .await
                    .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;
            }
        }

        // Write the content to the file
        tokio_fs::write(&path, content)
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(json!({
            "status": "success",
            "message": format!("File created successfully: {}", path)
        }))
    }
}

impl_tool_factory!(CreateFileTool);
