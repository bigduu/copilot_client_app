use crate::{
    impl_tool_factory,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError,
        ToolPermission, ToolType,
    },
};
use async_trait::async_trait;
use ignore::WalkBuilder;
use regex::Regex;
use serde_json::json;
use std::fs;
use std::path::Path;

/// Maximum file size to search (1MB)
const MAX_FILE_SIZE: u64 = 1_048_576;

/// Maximum search depth
const MAX_SEARCH_DEPTH: usize = 10;

/// Default maximum results
const DEFAULT_MAX_RESULTS: usize = 50;

/// Grep-based content search tool
#[derive(Debug)]
pub struct GrepSearchTool;

impl GrepSearchTool {
    pub const TOOL_NAME: &'static str = "grep";

    pub fn new() -> Self {
        Self
    }
}

impl Default for GrepSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for GrepSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Search file contents using regex patterns. Supports case-sensitive/insensitive search, file type filtering, and returns matches with line numbers and context.".to_string(),
            parameters: vec![
                Parameter {
                    name: "pattern".to_string(),
                    description: "The regex pattern to search for".to_string(),
                    required: true,
                },
                Parameter {
                    name: "path".to_string(),
                    description: "Optional path to search in (defaults to current directory)".to_string(),
                    required: false,
                },
                Parameter {
                    name: "case_sensitive".to_string(),
                    description: "Whether the search should be case-sensitive (default: false)".to_string(),
                    required: false,
                },
                Parameter {
                    name: "file_type".to_string(),
                    description: "Optional file extension to filter by (e.g., 'rs', 'ts', 'tsx')".to_string(),
                    required: false,
                },
                Parameter {
                    name: "max_results".to_string(),
                    description: "Maximum number of results to return (default: 50, max: 500)".to_string(),
                    required: false,
                },
            ],
            requires_approval: false,
            category: crate::types::tool_category::ToolCategory::SearchAndDiscovery,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: Some(
                r#"
Example usage:
```json
{
  "tool": "grep",
  "parameters": {
    "pattern": "async fn.*execute",
    "file_type": "rs",
    "case_sensitive": false,
    "max_results": 30
  },
  "terminate": false
}
```

The grep tool searches file contents and returns matches with:
- File path
- Line number
- Matched line content
- Surrounding context (1 line before/after)

Use terminate=false if you need to process the results further (e.g., read specific files).
Use terminate=true if presenting search results to the user."#
                    .to_string(),
            ),
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some(
                "Use terminate=false if you need to read or analyze the matched files. \
                 Use terminate=true if you're ready to present the search results to the user without further actions."
                    .to_string()
            ),
            required_permissions: vec![ToolPermission::ReadFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (pattern_str, search_path, case_sensitive, file_type, max_results) = match args {
            ToolArguments::Json(json) => {
                let pattern = json
                    .get("pattern")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'pattern' parameter".to_string()))?;

                let path = json
                    .get("path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let case_sensitive = json
                    .get("case_sensitive")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let file_type = json
                    .get("file_type")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let max_results = json
                    .get("max_results")
                    .and_then(|v| v.as_u64())
                    .map(|n| n.min(500) as usize)
                    .unwrap_or(DEFAULT_MAX_RESULTS);

                (pattern.to_string(), path, case_sensitive, file_type, max_results)
            }
            _ => {
                return Err(ToolError::InvalidArguments(
                    "Expected JSON object with 'pattern' parameter".to_string(),
                ))
            }
        };

        // Build regex pattern
        let regex_pattern = if case_sensitive {
            pattern_str.clone()
        } else {
            format!("(?i){}", pattern_str)
        };

        let regex = Regex::new(&regex_pattern)
            .map_err(|e| ToolError::InvalidArguments(format!("Invalid regex pattern: {}", e)))?;

        // Determine search root
        let search_root = if let Some(path) = search_path {
            Path::new(&path).to_path_buf()
        } else {
            std::env::current_dir()
                .map_err(|e| ToolError::ExecutionFailed(format!("Failed to get current directory: {}", e)))?
        };

        // Perform search
        let mut results = Vec::new();
        let mut total_matches = 0;
        let mut files_searched = 0;
        let mut files_skipped = 0;

        let walker = WalkBuilder::new(&search_root)
            .max_depth(Some(MAX_SEARCH_DEPTH))
            .build();

        for entry in walker {
            if results.len() >= max_results {
                break;
            }

            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                continue;
            }

            let path = entry.path();

            // Filter by file type if specified
            if let Some(ref ext) = file_type {
                if path.extension().and_then(|e| e.to_str()) != Some(ext.as_str()) {
                    continue;
                }
            }

            // Check file size
            if let Ok(metadata) = entry.metadata() {
                if metadata.len() > MAX_FILE_SIZE {
                    files_skipped += 1;
                    continue;
                }
            }

            files_searched += 1;

            // Read and search file
            let content = match fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => {
                    files_skipped += 1;
                    continue;
                }
            };

            let lines: Vec<&str> = content.lines().collect();

            for (line_idx, line) in lines.iter().enumerate() {
                if results.len() >= max_results {
                    break;
                }

                if regex.is_match(line) {
                    total_matches += 1;

                    let line_number = line_idx + 1; // 1-indexed
                    let context_before = if line_idx > 0 {
                        Some(lines[line_idx - 1].to_string())
                    } else {
                        None
                    };
                    let context_after = if line_idx + 1 < lines.len() {
                        Some(lines[line_idx + 1].to_string())
                    } else {
                        None
                    };

                    results.push(json!({
                        "file": path.display().to_string(),
                        "line_number": line_number,
                        "line": line.to_string(),
                        "context_before": context_before,
                        "context_after": context_after,
                    }));
                }
            }
        }

        let message = if results.is_empty() {
            format!("No matches found for pattern '{}' (searched {} files)", pattern_str, files_searched)
        } else {
            let truncated = total_matches > results.len();
            let mut msg = format!(
                "Found {} match{} across {} file{} (searched {} files{})",
                results.len(),
                if results.len() == 1 { "" } else { "es" },
                results.iter().map(|r| r["file"].as_str().unwrap()).collect::<std::collections::HashSet<_>>().len(),
                if results.len() == 1 { "" } else { "s" },
                files_searched,
                if files_skipped > 0 { format!(", {} skipped", files_skipped) } else { String::new() }
            );
            if truncated {
                msg.push_str(&format!(
                    ". Total matches: {}. Showing first {}. Consider refining your search pattern.",
                    total_matches, results.len()
                ));
            }
            msg
        };

        Ok(json!({
            "status": "success",
            "message": message,
            "matches": results,
            "total_matches": total_matches,
            "files_searched": files_searched,
            "files_skipped": files_skipped,
        }))
    }
}

// Implement ToolFactory for bean-style registration
impl_tool_factory!(GrepSearchTool);

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_grep_valid_search() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello world\nThis is a test\nHello again").unwrap();

        let tool = GrepSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "Hello",
            "path": temp_dir.path().to_str().unwrap(),
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert!(result["matches"].as_array().unwrap().len() >= 2);
    }

    #[tokio::test]
    async fn test_grep_case_insensitive() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello World\nhello world\nHELLO WORLD").unwrap();

        let tool = GrepSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "hello",
            "path": temp_dir.path().to_str().unwrap(),
            "case_sensitive": false,
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["matches"].as_array().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn test_grep_file_type_filter() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("test.rs"), "fn main() {}").unwrap();
        fs::write(temp_dir.path().join("test.txt"), "fn main() {}").unwrap();

        let tool = GrepSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "fn main",
            "path": temp_dir.path().to_str().unwrap(),
            "file_type": "rs",
        }));

        let result = tool.execute(args).await.unwrap();
        let matches = result["matches"].as_array().unwrap();
        assert_eq!(matches.len(), 1);
        assert!(matches[0]["file"].as_str().unwrap().ends_with(".rs"));
    }

    #[tokio::test]
    async fn test_grep_no_matches() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello world").unwrap();

        let tool = GrepSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "notfound",
            "path": temp_dir.path().to_str().unwrap(),
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["matches"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_grep_invalid_regex() {
        let tool = GrepSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "[invalid",
        }));

        let result = tool.execute(args).await;
        assert!(result.is_err());
    }
}
