use crate::tools::{Parameter, Tool};
use anyhow::{Context, Result};
use async_trait::async_trait;
use similar::{ChangeTag, TextDiff};
use std::fs;
use std::io::{self, Read, Write};
use std::path::Path;
use std::process::Command;
use tokio::fs::{self as tokio_fs};
use walkdir::WalkDir;

// 1. File creation tool
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

// 2. File deletion tool
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

// 3. File reading tool (with partial reading)
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

// 4. File update tool (diff-based)
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

// 5. File append tool
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
        tokio::io::AsyncWriteExt::write_all(&mut file, content.as_bytes())
            .await
            .with_context(|| format!("Failed to append to file: {}", path))?;

        Ok(format!("Content appended successfully to file: {}", path))
    }
}

// 6. Command execution tool
#[derive(Debug)]
pub struct ExecuteCommandTool;

#[async_trait]
impl Tool for ExecuteCommandTool {
    fn name(&self) -> String {
        "execute_command".to_string()
    }

    fn description(&self) -> String {
        "Executes a shell command and returns the output".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "command".to_string(),
            description: "The shell command to execute".to_string(),
            required: true,
            value: "".to_string(),
        }]
    }

    fn required_approval(&self) -> bool {
        true
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut command = String::new();

        for param in parameters {
            if param.name == "command" {
                command = param.value;
            }
        }

        if command.is_empty() {
            return Err(anyhow::anyhow!("Command parameter is required"));
        }

        // Execute the command
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(&command)
            .output()
            .await
            .with_context(|| format!("Failed to execute command: {}", command))?;

        // Prepare the output
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        Ok(format!(
            "Command: {}\nExit code: {}\nStdout:\n{}\nStderr:\n{}",
            command, exit_code, stdout, stderr
        ))
    }
}

// 7. Search files tool
#[derive(Debug)]
pub struct SearchFilesTool;

#[async_trait]
impl Tool for SearchFilesTool {
    fn name(&self) -> String {
        "search_files".to_string()
    }

    fn description(&self) -> String {
        "Searches for files matching a pattern and/or containing specific text".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![
            Parameter {
                name: "path".to_string(),
                description: "The base path to search in".to_string(),
                required: true,
                value: "".to_string(),
            },
            Parameter {
                name: "pattern".to_string(),
                description: "File pattern to match (e.g., '*.rs', optional)".to_string(),
                required: false,
                value: "".to_string(),
            },
            Parameter {
                name: "content".to_string(),
                description: "Text content to search for within files (optional)".to_string(),
                required: false,
                value: "".to_string(),
            },
        ]
    }

    fn required_approval(&self) -> bool {
        false
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let mut path = String::new();
        let mut pattern = String::new();
        let mut content = String::new();

        for param in parameters {
            match param.name.as_str() {
                "path" => path = param.value,
                "pattern" => pattern = param.value,
                "content" => content = param.value,
                _ => (),
            }
        }

        if path.is_empty() {
            return Err(anyhow::anyhow!("Path parameter is required"));
        }

        let mut results = Vec::new();

        // Walk the directory tree
        for entry in WalkDir::new(&path).into_iter().filter_map(Result::ok) {
            let entry_path = entry.path();
            if !entry_path.is_file() {
                continue;
            }

            let file_name = entry_path.file_name().unwrap().to_string_lossy();

            // Check if the file matches the pattern
            if !pattern.is_empty() {
                let pattern_matches = if pattern.contains('*') {
                    // Simple glob-like matching
                    let pattern_parts: Vec<&str> = pattern.split('*').collect();
                    if pattern_parts.is_empty() {
                        true
                    } else {
                        let file_name_str = file_name.to_string();
                        pattern_parts.iter().enumerate().all(|(i, part)| {
                            if i == 0 && !pattern.starts_with('*') {
                                file_name_str.starts_with(part)
                            } else if i == pattern_parts.len() - 1 && !pattern.ends_with('*') {
                                file_name_str.ends_with(part)
                            } else {
                                file_name_str.contains(part)
                            }
                        })
                    }
                } else {
                    file_name.contains(&pattern)
                };

                if !pattern_matches {
                    continue;
                }
            }

            // If content search is specified, check file contents
            if !content.is_empty() {
                // Try to read the file content
                if let Ok(file_content) = fs::read_to_string(entry_path) {
                    if !file_content.contains(&content) {
                        continue;
                    }
                } else {
                    // If we can't read the file, skip it
                    continue;
                }
            }

            // Add the matching file to results
            results.push(entry_path.to_string_lossy().to_string());
        }

        if results.is_empty() {
            Ok("No files found matching the criteria".to_string())
        } else {
            Ok(format!(
                "Found {} matching files:\n{}",
                results.len(),
                results.join("\n")
            ))
        }
    }
}

// Function to register all file tools to a tool manager
pub fn register_file_tools(manager: &mut crate::tools::ToolManager) {
    use std::sync::Arc;

    manager.register_tool(Arc::new(CreateFileTool));
    manager.register_tool(Arc::new(DeleteFileTool));
    manager.register_tool(Arc::new(ReadFileTool));
    manager.register_tool(Arc::new(UpdateFileTool));
    manager.register_tool(Arc::new(AppendFileTool));
    manager.register_tool(Arc::new(ExecuteCommandTool));
    manager.register_tool(Arc::new(SearchFilesTool));
}
