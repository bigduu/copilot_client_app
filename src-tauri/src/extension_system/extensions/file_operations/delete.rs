use crate::extension_system::{auto_register_tool, Parameter, Tool, ToolType};
use anyhow::Result;
use async_trait::async_trait;
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

#[async_trait]
impl Tool for DeleteFileTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "Deletes a file from the filesystem".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "path".to_string(),
            description: "The path of the file to delete".to_string(),
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
        let mut path = String::new();

        for param in parameters {
            if param.name == "path" {
                path = param.value;
            }
        }

        if path.is_empty() {
            return Err(anyhow::anyhow!("Path parameter is required"));
        }

        // Delete the file
        tokio_fs::remove_file(&path).await?;

        Ok(format!("File deleted successfully: {}", path))
    }
}

// Auto-register the tool
auto_register_tool!(DeleteFileTool);
