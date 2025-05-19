use crate::tools::{Parameter, Tool};
use anyhow::{Context, Result};
use async_trait::async_trait;
use tokio::io::AsyncWriteExt;

// 文件追加工具
#[derive(Debug)]
pub struct AppendFileTool;

#[async_trait]
impl Tool for AppendFileTool {
    fn name(&self) -> String {
        "append_file".to_string()
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

        if path.is_empty() || content.is_empty() {
            return Err(anyhow::anyhow!("Path and content parameters are required"));
        }

        // Open the file in append mode
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .with_context(|| format!("Failed to open file: {}", path))?;

        // Append the content
        file.write_all(content.as_bytes())
            .await
            .with_context(|| format!("Failed to append to file: {}", path))?;

        Ok(format!("Content appended successfully to file: {}", path))
    }
}
