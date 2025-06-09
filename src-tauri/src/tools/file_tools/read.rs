use crate::tools::{Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use tokio::fs as tokio_fs;

// 文件读取工具（支持部分读取）
#[derive(Debug)]
pub struct ReadFileTool;

#[async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> String {
        "read_file".to_string()
    }

    fn description(&self) -> String {
        "Reads the content of a file, optionally a specific range".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "path".to_string(),
                description: "The path of the file to read".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "start_line".to_string(),
                description: "The line number to start reading from (1-based, optional)"
                    .to_string(),
                required: false,
                value: "".to_string(),
            },
            Parameter {
                name: "end_line".to_string(),
                description: "The line number to end reading at (1-based, optional)".to_string(),
                required: false,
                value: "".to_string(),
            },
        ]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut path = String::new();
        let mut start_line: Option<usize> = None;
        let mut end_line: Option<usize> = None;

        for param in parameters {
            match param.name.as_str() {
                "path" => path = param.value,
                "start_line" => {
                    if !param.value.is_empty() {
                        start_line = Some(
                            param
                                .value
                                .parse::<usize>()
                                .with_context(|| "Invalid start_line parameter")?,
                        );
                    }
                }
                "end_line" => {
                    if !param.value.is_empty() {
                        end_line = Some(
                            param
                                .value
                                .parse::<usize>()
                                .with_context(|| "Invalid end_line parameter")?,
                        );
                    }
                }
                _ => (),
            }
        }

        if path.is_empty() {
            return Err(anyhow::anyhow!("Path parameter is required"));
        }

        // Read the file
        let content = tokio_fs::read_to_string(&path)
            .await
            .with_context(|| format!("Failed to read file: {}", path))?;

        // If no range is specified, return the entire file
        if start_line.is_none() && end_line.is_none() {
            return Ok(content);
        }

        // Extract the specified range
        let lines: Vec<&str> = content.lines().collect();
        let start = start_line.unwrap_or(1).saturating_sub(1); // Convert to 0-based index
        let end = end_line.unwrap_or(lines.len());

        if start >= lines.len() {
            return Err(anyhow::anyhow!("Start line exceeds file length"));
        }

        let end = end.min(lines.len());
        let selected_lines = lines[start..end].join("\n");

        Ok(format!(
            "Lines {}-{} of file {}:\n{}",
            start + 1,
            end,
            path,
            selected_lines
        ))
    }
}
