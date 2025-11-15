use crate::{
    impl_tool_factory,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError,
        ToolPermission, ToolType,
    },
};
use async_trait::async_trait;
use serde_json::json;
use tokio::fs as tokio_fs;

/// Line-based file editing tool
#[derive(Debug)]
pub struct EditLinesTool;

impl EditLinesTool {
    pub const TOOL_NAME: &'static str = "edit_lines";

    pub fn new() -> Self {
        Self
    }
}

impl Default for EditLinesTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for EditLinesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Insert, delete, or replace specific line ranges in a file. More precise than rewriting entire files.".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to edit".to_string(),
                    required: true,
                },
                Parameter {
                    name: "operation".to_string(),
                    description: "The operation to perform: 'insert', 'delete', or 'replace'".to_string(),
                    required: true,
                },
                Parameter {
                    name: "start_line".to_string(),
                    description: "The starting line number (1-indexed)".to_string(),
                    required: true,
                },
                Parameter {
                    name: "end_line".to_string(),
                    description: "The ending line number (1-indexed, inclusive). For 'insert', this is ignored.".to_string(),
                    required: false,
                },
                Parameter {
                    name: "content".to_string(),
                    description: "The content to insert or replace with (not needed for 'delete')".to_string(),
                    required: false,
                },
            ],
            requires_approval: true,
            category: crate::types::tool_category::ToolCategory::FileWriting,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: Some(
                r#"
Example usage:

Insert lines after line 10:
```json
{
  "tool": "edit_lines",
  "parameters": {
    "path": "src/lib.rs",
    "operation": "insert",
    "start_line": 10,
    "content": "pub use new_module::*;\n"
  },
  "terminate": true
}
```

Delete lines 5-8:
```json
{
  "tool": "edit_lines",
  "parameters": {
    "path": "src/main.rs",
    "operation": "delete",
    "start_line": 5,
    "end_line": 8
  },
  "terminate": true
}
```

Replace lines 10-15:
```json
{
  "tool": "edit_lines",
  "parameters": {
    "path": "src/config.rs",
    "operation": "replace",
    "start_line": 10,
    "end_line": 15,
    "content": "// New implementation\npub fn config() { ... }\n"
  },
  "terminate": true
}
```

Use terminate=true after successful edit.
Use terminate=false if you need to read the file to verify changes."#
                    .to_string(),
            ),
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some(
                "Use terminate=true after successful edit. \
                 Use terminate=false if you need to read the file to verify the changes."
                    .to_string()
            ),
            required_permissions: vec![ToolPermission::ReadFiles, ToolPermission::WriteFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (path, operation, start_line, end_line, content) = match args {
            ToolArguments::Json(json) => {
                let path = json
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;

                let operation = json
                    .get("operation")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'operation' parameter".to_string()))?;

                if !["insert", "delete", "replace"].contains(&operation) {
                    return Err(ToolError::InvalidArguments(
                        "operation must be 'insert', 'delete', or 'replace'".to_string(),
                    ));
                }

                let start_line = json
                    .get("start_line")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'start_line' parameter".to_string()))?
                    as usize;

                let end_line = json
                    .get("end_line")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as usize);

                let content = json
                    .get("content")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                (path.to_string(), operation.to_string(), start_line, end_line, content)
            }
            _ => {
                return Err(ToolError::InvalidArguments(
                    "Expected JSON object with path, operation, and start_line parameters".to_string(),
                ))
            }
        };

        // Validate line numbers
        if start_line == 0 {
            return Err(ToolError::InvalidArguments(
                "start_line must be 1 or greater (1-indexed)".to_string(),
            ));
        }

        // Read the file
        let file_content = tokio_fs::read_to_string(&path)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to read file '{}': {}", path, e)))?;

        let mut lines: Vec<String> = file_content.lines().map(|s| s.to_string()).collect();
        let original_line_count = lines.len();

        // Perform operation
        match operation.as_str() {
            "insert" => {
                if start_line > lines.len() + 1 {
                    return Err(ToolError::InvalidArguments(format!(
                        "start_line {} is beyond file length {} (can be at most {} for insert)",
                        start_line,
                        original_line_count,
                        original_line_count + 1
                    )));
                }

                let content = content.ok_or_else(|| {
                    ToolError::InvalidArguments("'content' parameter required for insert operation".to_string())
                })?;

                let new_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                let insert_idx = start_line; // Insert after start_line (1-indexed becomes 0-indexed position)

                lines.splice(insert_idx..insert_idx, new_lines);
            }
            "delete" => {
                let end = end_line.unwrap_or(start_line);

                if start_line > original_line_count {
                    return Err(ToolError::InvalidArguments(format!(
                        "start_line {} is beyond file length {}",
                        start_line, original_line_count
                    )));
                }

                if end > original_line_count {
                    return Err(ToolError::InvalidArguments(format!(
                        "end_line {} is beyond file length {}",
                        end, original_line_count
                    )));
                }

                if end < start_line {
                    return Err(ToolError::InvalidArguments(
                        "end_line must be greater than or equal to start_line".to_string(),
                    ));
                }

                // Convert to 0-indexed
                let start_idx = start_line - 1;
                let end_idx = end;

                lines.drain(start_idx..end_idx);
            }
            "replace" => {
                let end = end_line.ok_or_else(|| {
                    ToolError::InvalidArguments("'end_line' parameter required for replace operation".to_string())
                })?;

                if start_line > original_line_count {
                    return Err(ToolError::InvalidArguments(format!(
                        "start_line {} is beyond file length {}",
                        start_line, original_line_count
                    )));
                }

                if end > original_line_count {
                    return Err(ToolError::InvalidArguments(format!(
                        "end_line {} is beyond file length {}",
                        end, original_line_count
                    )));
                }

                if end < start_line {
                    return Err(ToolError::InvalidArguments(
                        "end_line must be greater than or equal to start_line".to_string(),
                    ));
                }

                let content = content.ok_or_else(|| {
                    ToolError::InvalidArguments("'content' parameter required for replace operation".to_string())
                })?;

                let new_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

                // Convert to 0-indexed
                let start_idx = start_line - 1;
                let end_idx = end;

                lines.splice(start_idx..end_idx, new_lines);
            }
            _ => unreachable!(),
        }

        let new_line_count = lines.len();

        // Write back to file
        let new_content = lines.join("\n");
        if !new_content.is_empty() && !file_content.is_empty() && file_content.ends_with('\n') {
            tokio_fs::write(&path, format!("{}\n", new_content))
                .await
                .map_err(|e| ToolError::ExecutionFailed(format!("Failed to write file '{}': {}", path, e)))?;
        } else {
            tokio_fs::write(&path, new_content)
                .await
                .map_err(|e| ToolError::ExecutionFailed(format!("Failed to write file '{}': {}", path, e)))?;
        }

        Ok(json!({
            "status": "success",
            "message": format!(
                "Successfully performed {} operation on '{}' (lines: {} -> {})",
                operation, path, original_line_count, new_line_count
            ),
            "operation": operation,
            "original_line_count": original_line_count,
            "new_line_count": new_line_count,
            "lines_changed": (new_line_count as i64) - (original_line_count as i64),
        }))
    }
}

// Implement ToolFactory for bean-style registration
impl_tool_factory!(EditLinesTool);

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_edit_lines_insert() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "line 1\nline 2\nline 3\n").unwrap();

        let tool = EditLinesTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "insert",
            "start_line": 2,
            "content": "inserted line",
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["new_line_count"], 4);

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("line 2\ninserted line\nline 3"));
    }

    #[tokio::test]
    async fn test_edit_lines_delete() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "line 1\nline 2\nline 3\nline 4\n").unwrap();

        let tool = EditLinesTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "delete",
            "start_line": 2,
            "end_line": 3,
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["new_line_count"], 2);

        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "line 1\nline 4\n");
    }

    #[tokio::test]
    async fn test_edit_lines_replace() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "line 1\nline 2\nline 3\nline 4\n").unwrap();

        let tool = EditLinesTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "replace",
            "start_line": 2,
            "end_line": 3,
            "content": "replaced line",
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["new_line_count"], 3);

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("line 1\nreplaced line\nline 4"));
    }

    #[tokio::test]
    async fn test_edit_lines_invalid_range() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "line 1\nline 2\n").unwrap();

        let tool = EditLinesTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "delete",
            "start_line": 5,
            "end_line": 10,
        }));

        let result = tool.execute(args).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_edit_lines_file_not_found() {
        let tool = EditLinesTool::new();
        let args = ToolArguments::Json(json!({
            "path": "/nonexistent/file.txt",
            "operation": "insert",
            "start_line": 1,
            "content": "test",
        }));

        let result = tool.execute(args).await;
        assert!(result.is_err());
    }
}
