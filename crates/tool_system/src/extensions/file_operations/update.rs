use crate::{
    registry::macros::auto_register_tool,
    types::{Parameter, Tool, ToolType},
};
use anyhow::Result;
use async_trait::async_trait;
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
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "Updates the content of an existing file".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "path".to_string(),
                description: "The path of the file to update".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "content".to_string(),
                description: "The new content for the file".to_string(),
                required: true,
                value: "".to_string(),
            },
        ]
    }

    fn required_approval(&self) -> bool {
        true
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut path = String::new();
        let mut content = String::new();

        for param in parameters {
            match param.name.as_str() {
                "path" => path = param.value,
                "content" => content = param.value,
                _ => (),
            }
        }

        if path.is_empty() {
            return Err(anyhow::anyhow!("Path parameter is required"));
        }

        // Update the file
        tokio_fs::write(&path, content).await?;

        Ok(format!("File updated successfully: {}", path))
    }
}

// Auto-register the tool
auto_register_tool!(UpdateFileTool);
