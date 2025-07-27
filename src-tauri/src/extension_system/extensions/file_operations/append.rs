use crate::extension_system::{auto_register_tool, Parameter, Tool, ToolType};
use anyhow::Result;
use async_trait::async_trait;
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

#[async_trait]
impl Tool for AppendFileTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "Appends content to the end of a file".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "path".to_string(),
                description: "The path of the file to append to".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "content".to_string(),
                description: "The content to append to the file".to_string(),
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
        tokio_fs::write(&path, new_content).await?;

        Ok(format!("Content appended successfully to: {}", path))
    }
}

// Auto-register the tool
auto_register_tool!(AppendFileTool);
