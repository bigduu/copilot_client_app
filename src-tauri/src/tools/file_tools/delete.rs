use crate::tools::{Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use tokio::fs as tokio_fs;

// 文件删除工具
#[derive(Debug)]
pub struct DeleteFileTool;

#[async_trait]
impl Tool for DeleteFileTool {
    fn name(&self) -> String {
        "delete_file".to_string()
    }

    fn description(&self) -> String {
        "Deletes a file at the specified path".to_string()
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
        tokio_fs::remove_file(&path)
            .await
            .with_context(|| format!("Failed to delete file: {}", path))?;

        Ok(format!("File deleted successfully: {}", path))
    }
}
