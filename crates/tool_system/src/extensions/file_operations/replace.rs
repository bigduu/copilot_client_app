use crate::{
    impl_tool_factory,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError,
        ToolPermission, ToolType,
    },
};
use async_trait::async_trait;
use regex::Regex;
use serde_json::json;
use similar::{ChangeTag, TextDiff};
use tokio::fs as tokio_fs;

/// Find and replace tool with preview mode
#[derive(Debug)]
pub struct ReplaceInFileTool;

impl ReplaceInFileTool {
    pub const TOOL_NAME: &'static str = "replace_in_file";

    pub fn new() -> Self {
        Self
    }
}

impl Default for ReplaceInFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ReplaceInFileTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Find and replace text in a file. Supports literal string replacement or regex patterns. Includes preview mode to see changes before applying.".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to modify".to_string(),
                    required: true,
                },
                Parameter {
                    name: "find".to_string(),
                    description: "The text or regex pattern to find".to_string(),
                    required: true,
                },
                Parameter {
                    name: "replace".to_string(),
                    description: "The replacement text (supports capture groups like $1 with regex)".to_string(),
                    required: true,
                },
                Parameter {
                    name: "is_regex".to_string(),
                    description: "Whether 'find' is a regex pattern (default: false)".to_string(),
                    required: false,
                },
                Parameter {
                    name: "preview_only".to_string(),
                    description: "If true, shows what would change without modifying the file (default: false)".to_string(),
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
```json
{
  "tool": "replace_in_file",
  "parameters": {
    "path": "src/main.rs",
    "find": "old_function_name",
    "replace": "new_function_name",
    "preview_only": true
  },
  "terminate": false
}
```

With regex:
```json
{
  "tool": "replace_in_file",
  "parameters": {
    "path": "src/lib.rs",
    "find": "fn (\\w+)\\(\\)",
    "replace": "pub fn $1()",
    "is_regex": true
  },
  "terminate": true
}
```

IMPORTANT: Use preview_only=true first to verify changes before applying them.
Use terminate=true after successful replacement.
Use terminate=false if you need to verify the changes by reading the file."#
                    .to_string(),
            ),
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some(
                "ALWAYS use preview_only=true first to verify the changes. \
                 After previewing and confirming, call again with preview_only=false to apply. \
                 Use terminate=true after successful replacement. \
                 Use terminate=false if you need to read the file to verify changes."
                    .to_string()
            ),
            required_permissions: vec![ToolPermission::ReadFiles, ToolPermission::WriteFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (path, find, replace, is_regex, preview_only) = match args {
            ToolArguments::Json(json) => {
                let path = json
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;

                let find = json
                    .get("find")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'find' parameter".to_string()))?;

                let replace = json
                    .get("replace")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'replace' parameter".to_string()))?;

                let is_regex = json
                    .get("is_regex")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let preview_only = json
                    .get("preview_only")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                (path.to_string(), find.to_string(), replace.to_string(), is_regex, preview_only)
            }
            _ => {
                return Err(ToolError::InvalidArguments(
                    "Expected JSON object with path, find, and replace parameters".to_string(),
                ))
            }
        };

        // Read the file
        let original_content = tokio_fs::read_to_string(&path)
            .await
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to read file '{}': {}", path, e)))?;

        // Perform replacement
        let (new_content, replacement_count) = if is_regex {
            let regex = Regex::new(&find)
                .map_err(|e| ToolError::InvalidArguments(format!("Invalid regex pattern: {}", e)))?;

            let mut count = 0;
            let result = regex.replace_all(&original_content, |caps: &regex::Captures| {
                count += 1;
                let mut result = replace.clone();
                // Replace capture groups ($1, $2, etc.)
                for i in 0..caps.len() {
                    if let Some(captured) = caps.get(i) {
                        result = result.replace(&format!("${}", i), captured.as_str());
                    }
                }
                result
            }).to_string();

            (result, count)
        } else {
            let count = original_content.matches(&find).count();
            let result = original_content.replace(&find, &replace);
            (result, count)
        };

        if replacement_count == 0 {
            return Ok(json!({
                "status": "success",
                "message": format!("Pattern '{}' not found in file '{}'", find, path),
                "replacements": 0,
            }));
        }

        if preview_only {
            // Generate diff
            let diff = TextDiff::from_lines(&original_content, &new_content);
            let mut diff_output = Vec::new();

            for change in diff.iter_all_changes() {
                let sign = match change.tag() {
                    ChangeTag::Delete => "-",
                    ChangeTag::Insert => "+",
                    ChangeTag::Equal => " ",
                };
                diff_output.push(format!("{}{}", sign, change.value()));
            }

            Ok(json!({
                "status": "preview",
                "message": format!("Preview: Would make {} replacement(s) in '{}'", replacement_count, path),
                "replacements": replacement_count,
                "diff": diff_output.join(""),
                "preview_only": true,
            }))
        } else {
            // Write the modified content
            tokio_fs::write(&path, &new_content)
                .await
                .map_err(|e| ToolError::ExecutionFailed(format!("Failed to write file '{}': {}", path, e)))?;

            Ok(json!({
                "status": "success",
                "message": format!("Successfully replaced {} occurrence(s) in '{}'", replacement_count, path),
                "replacements": replacement_count,
                "preview_only": false,
            }))
        }
    }
}

// Implement ToolFactory for bean-style registration
impl_tool_factory!(ReplaceInFileTool);

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_replace_simple_text() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello world\nHello again").unwrap();

        let tool = ReplaceInFileTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": "Hello",
            "replace": "Hi",
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["replacements"], 2);

        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Hi world\nHi again");
    }

    #[tokio::test]
    async fn test_replace_with_regex() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.rs");
        fs::write(&file_path, "fn test() {}\nfn main() {}").unwrap();

        let tool = ReplaceInFileTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": r"fn (\w+)\(\)",
            "replace": "pub fn $1()",
            "is_regex": true,
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["replacements"], 2);

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("pub fn test()"));
        assert!(content.contains("pub fn main()"));
    }

    #[tokio::test]
    async fn test_replace_preview_mode() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello world").unwrap();

        let tool = ReplaceInFileTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": "Hello",
            "replace": "Hi",
            "preview_only": true,
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "preview");
        assert_eq!(result["preview_only"], true);

        // File should not be modified
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Hello world");
    }

    #[tokio::test]
    async fn test_replace_pattern_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello world").unwrap();

        let tool = ReplaceInFileTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": "notfound",
            "replace": "replacement",
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["replacements"], 0);
    }

    #[tokio::test]
    async fn test_replace_file_not_found() {
        let tool = ReplaceInFileTool::new();
        let args = ToolArguments::Json(json!({
            "path": "/nonexistent/file.txt",
            "find": "test",
            "replace": "replacement",
        }));

        let result = tool.execute(args).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_replace_invalid_regex() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "test").unwrap();

        let tool = ReplaceInFileTool::new();
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": "[invalid",
            "replace": "replacement",
            "is_regex": true,
        }));

        let result = tool.execute(args).await;
        assert!(result.is_err());
    }
}
