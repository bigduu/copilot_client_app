use agent_core::tools::{Tool, ToolError, ToolResult};
use async_trait::async_trait;
use serde_json::json;
use tokio::fs;

/// Tool for reading file contents
pub struct ReadFileTool;

impl ReadFileTool {
    pub fn new() -> Self {
        Self
    }

    /// Expand ~ to home directory
    fn expand_path(path: &str) -> String {
        if path.starts_with("~/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(&path[2..]).to_string_lossy().to_string();
            }
        }
        path.to_string()
    }

    /// Internal implementation for reading files
    pub async fn read_file(path: &str) -> Result<String, String> {
        // Expand ~ to home directory
        let expanded_path = Self::expand_path(path);

        // Security check: ensure path doesn't contain ..
        if expanded_path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }

        fs::read_to_string(&expanded_path)
            .await
            .map_err(|e| format!("Failed to read file '{}': {}", expanded_path, e))
    }
}

impl Default for ReadFileTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "Read file content. Supports text files (txt, json, md, rs, etc.). Path can be absolute (e.g., /Users/bigduu/workspace/file.txt) or use ~ for home directory (e.g., ~/.bodhi/skills/my-skill/SKILL.md)"
    }

    fn parameters_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path of the file"
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, args: serde_json::Value) -> Result<ToolResult, ToolError> {
        let path = args["path"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;

        match Self::read_file(path).await {
            Ok(content) => Ok(ToolResult {
                success: true,
                result: content,
                display_preference: Some("markdown".to_string()),
            }),
            Err(e) => Ok(ToolResult {
                success: false,
                result: e,
                display_preference: None,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::fs;

    #[tokio::test]
    async fn test_read_file_success() {
        let test_path = "/tmp/test_read_file.txt";
        let test_content = "Hello, ReadFileTool!";

        // Setup: create test file
        fs::write(test_path, test_content).await.unwrap();

        let tool = ReadFileTool::new();
        let result = tool.execute(json!({"path": test_path})).await.unwrap();

        assert!(result.success);
        assert_eq!(result.result, test_content);

        // Cleanup
        let _ = fs::remove_file(test_path).await;
    }

    #[tokio::test]
    async fn test_read_file_path_traversal() {
        let tool = ReadFileTool::new();
        let result = tool
            .execute(json!({"path": "/etc/../etc/passwd"}))
            .await
            .unwrap();

        assert!(!result.success);
        assert!(result.result.contains("Invalid path"));
    }

    #[tokio::test]
    async fn test_read_file_missing_param() {
        let tool = ReadFileTool::new();
        let result = tool.execute(json!({})).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Missing 'path'"));
    }

    #[tokio::test]
    async fn test_expand_tilde() {
        // Test that ~ gets expanded to home directory
        let tool = ReadFileTool::new();

        // Create a file in home directory
        let home = dirs::home_dir().expect("Home dir should exist");
        let test_file = home.join(".test_read_file_tilde.txt");
        fs::write(&test_file, "tilde test content").await.unwrap();

        // Read using ~
        let result = tool
            .execute(json!({"path": "~/.test_read_file_tilde.txt"}))
            .await
            .unwrap();

        assert!(result.success);
        assert_eq!(result.result, "tilde test content");

        // Cleanup
        let _ = fs::remove_file(&test_file).await;
    }
}
