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

// Directory listing tool
#[derive(Debug)]
pub struct ListDirectoryTool;

impl ListDirectoryTool {
    pub const TOOL_NAME: &'static str = "list_directory";

    pub fn new() -> Self {
        Self
    }
}

impl Default for ListDirectoryTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ListDirectoryTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Lists the contents of a directory".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the directory to list".to_string(),
                    required: true,
                },
                Parameter {
                    name: "depth".to_string(),
                    description: "The depth to traverse (default: 1)".to_string(),
                    required: false,
                },
            ],
            requires_approval: false,
            category: crate::types::tool_category::ToolCategory::SearchAndDiscovery,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: None,
            required_permissions: vec![ToolPermission::ReadFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (path, depth) = match args {
            ToolArguments::String(path) => (path, 1),
            ToolArguments::Json(json) => {
                let path = json
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing path".to_string()))?
                    .to_string();
                let depth = json.get("depth").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
                (path, depth)
            }
            _ => {
                return Err(ToolError::InvalidArguments(
                    "Expected a single string path or a JSON object with path and depth"
                        .to_string(),
                ))
            }
        };

        // Check if path exists and is a directory
        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err(ToolError::ExecutionFailed(format!(
                "Path does not exist: {}",
                path
            )));
        }
        if !path_obj.is_dir() {
            return Err(ToolError::ExecutionFailed(format!(
                "Path is not a directory: {}",
                path
            )));
        }

        // List directory contents
        let mut entries = Vec::new();
        list_directory_recursive(&path, depth, 0, &mut entries).await?;

        Ok(json!({
            "path": path,
            "entries": entries,
        }))
    }
}

// Recursive helper function to list directory contents
async fn list_directory_recursive(
    path: &str,
    max_depth: usize,
    current_depth: usize,
    entries: &mut Vec<serde_json::Value>,
) -> Result<(), ToolError> {
    if current_depth >= max_depth {
        return Ok(());
    }

    let mut read_dir = tokio_fs::read_dir(path)
        .await
        .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?
    {
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();

        let metadata = entry
            .metadata()
            .await
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        let entry_type = if metadata.is_dir() {
            "directory"
        } else if metadata.is_file() {
            "file"
        } else {
            "other"
        };

        entries.push(json!({
            "name": entry_name,
            "path": entry_path.to_string_lossy().to_string(),
            "type": entry_type,
        }));

        // Recursively list subdirectories if within depth limit
        if metadata.is_dir() && current_depth + 1 < max_depth {
            Box::pin(list_directory_recursive(
                &entry_path.to_string_lossy().to_string(),
                max_depth,
                current_depth + 1,
                entries,
            ))
            .await?;
        }
    }

    Ok(())
}

impl_tool_factory!(ListDirectoryTool);
