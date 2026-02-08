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

    /// Internal implementation for reading files
    pub async fn read_file(path: &str) -> Result<String, String> {
        // Security check: ensure path doesn't contain ..
        if path.contains("..") {
            return Err("Invalid path: contains '..'".to_string());
        }

        fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read file '{}': {}", path, e))
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
        "Read file content, supporting text files like txt, json, md, rs, etc. Path must be absolute, e.g., /Users/bigduu/workspace/project/file.txt"
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
}
