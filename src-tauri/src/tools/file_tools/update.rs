use crate::tools::{Parameter, Tool, ToolType};
use anyhow::{Context, Result};
use async_trait::async_trait;
use similar::{ChangeTag, TextDiff};
use tokio::fs as tokio_fs;

// File update tool (diff-based)
#[derive(Debug)]
pub struct UpdateFileTool;

#[async_trait]
impl Tool for UpdateFileTool {
    fn name(&self) -> String {
        "update_file".to_string()
    }

    fn description(&self) -> String {
        "Updates a file using diff-style specification".to_string()
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
                name: "old_content".to_string(),
                description: "The content to be replaced".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "new_content".to_string(),
                description: "The content to replace with".to_string(),
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
        let mut old_content = String::new();
        let mut new_content = String::new();

        for param in parameters {
            match param.name.as_str() {
                "path" => path = param.value,
                "old_content" => old_content = param.value,
                "new_content" => new_content = param.value,
                _ => (),
            }
        }

        if path.is_empty() || old_content.is_empty() {
            return Err(anyhow::anyhow!(
                "Path and old_content parameters are required"
            ));
        }

        // Read the current file content
        let current_content = tokio_fs::read_to_string(&path)
            .await
            .with_context(|| format!("Failed to read file: {}", path))?;

        // Check if the old content exists in the file
        if !current_content.contains(&old_content) {
            return Err(anyhow::anyhow!(
                "The specified old content was not found in the file"
            ));
        }

        // Create the new content by replacing the old content with the new content
        let updated_content = current_content.replace(&old_content, &new_content);

        // Write the updated content back to the file
        tokio_fs::write(&path, updated_content.clone())
            .await
            .with_context(|| format!("Failed to write to file: {}", path))?;

        // Generate a diff for the report
        let diff = TextDiff::from_lines(&current_content, &updated_content);
        let mut diff_output = String::new();

        for change in diff.iter_all_changes() {
            let sign = match change.tag() {
                ChangeTag::Delete => "-",
                ChangeTag::Insert => "+",
                ChangeTag::Equal => " ",
            };
            diff_output.push_str(&format!("{}{}", sign, change));
        }

        Ok(format!(
            "File updated successfully: {}\nDiff:\n{}",
            path, diff_output
        ))
    }
}
