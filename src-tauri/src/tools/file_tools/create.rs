use crate::tools::{Parameter, Tool, ToolType};
use anyhow::Result;
use async_trait::async_trait;
use std::path::Path;
use tokio::fs as tokio_fs;

// File creation tool
#[derive(Debug)]
pub struct CreateFileTool;

#[async_trait]
impl Tool for CreateFileTool {
    fn name(&self) -> String {
        "create_file".to_string()
    }

    fn description(&self) -> String {
        "Creates a new file with the specified content".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "path".to_string(),
                description: "The path of the file to create".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "content".to_string(),
                description: "The content to write to the file".to_string(),
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

    fn categories(&self) -> Vec<crate::tools::tool_types::CategoryId> {
        vec![crate::tools::tool_types::CategoryId::FileOperations]
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

        // Create parent directories if they don't exist
        if let Some(parent) = Path::new(&path).parent() {
            if !parent.exists() {
                tokio_fs::create_dir_all(parent).await?;
            }
        }

        // Write the content to the file
        tokio_fs::write(&path, content).await?;

        Ok(format!("File created successfully: {}", path))
    }
}
