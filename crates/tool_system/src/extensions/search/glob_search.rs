use crate::{
    impl_tool_factory,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError,
        ToolPermission, ToolType,
    },
};
use async_trait::async_trait;
use glob::Pattern;
use ignore::WalkBuilder;
use serde_json::json;

/// Default maximum results
const DEFAULT_MAX_RESULTS: usize = 100;

/// Maximum search depth
const MAX_SEARCH_DEPTH: usize = 10;

/// Glob-based file search tool
#[derive(Debug)]
pub struct GlobSearchTool;

impl GlobSearchTool {
    pub const TOOL_NAME: &'static str = "glob";

    pub fn new() -> Self {
        Self
    }
}

impl Default for GlobSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for GlobSearchTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "Find files matching glob patterns. Supports wildcards like '**/*.tsx' for recursive search, '*.rs' for current directory, etc.".to_string(),
            parameters: vec![
                Parameter {
                    name: "pattern".to_string(),
                    description: "The glob pattern to match files against (e.g., '**/*.tsx', 'src/**/*.test.ts')".to_string(),
                    required: true,
                },
                Parameter {
                    name: "exclude".to_string(),
                    description: "Optional array of directories to exclude (defaults to ['node_modules', 'dist', 'target', '.git'])".to_string(),
                    required: false,
                },
                Parameter {
                    name: "max_results".to_string(),
                    description: "Maximum number of files to return (default: 100, max: 500)".to_string(),
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
  "tool": "glob",
  "parameters": {
    "pattern": "**/*.tsx",
    "exclude": ["node_modules", "dist"],
    "max_results": 50
  },
  "terminate": false
}
```

Common patterns:
- "**/*.tsx" - All .tsx files recursively
- "src/**/*.test.ts" - All .test.ts files in src directory
- "*.rs" - All .rs files in current directory
- "docs/**/*.md" - All .md files in docs directory

Use terminate=false if you need to read or process the matched files.
Use terminate=true if presenting the file list to the user."#
                    .to_string(),
            ),
            hide_in_selector: true,
            display_preference: DisplayPreference::Default,
            termination_behavior_doc: Some(
                "Use terminate=false if you need to read or analyze the matched files. \
                 Use terminate=true if you're ready to present the file list to the user without further actions."
                    .to_string()
            ),
            required_permissions: vec![ToolPermission::ReadFiles],
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let (pattern_str, exclude_dirs, max_results) = match args {
            ToolArguments::Json(json) => {
                let pattern = json
                    .get("pattern")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'pattern' parameter".to_string()))?;

                let exclude = json
                    .get("exclude")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_else(|| {
                        vec![
                            "node_modules".to_string(),
                            "dist".to_string(),
                            "target".to_string(),
                            ".git".to_string(),
                        ]
                    });

                let max_results = json
                    .get("max_results")
                    .and_then(|v| v.as_u64())
                    .map(|n| n.min(500) as usize)
                    .unwrap_or(DEFAULT_MAX_RESULTS);

                (pattern.to_string(), exclude, max_results)
            }
            _ => {
                return Err(ToolError::InvalidArguments(
                    "Expected JSON object with 'pattern' parameter".to_string(),
                ))
            }
        };

        // Parse glob pattern
        let glob_pattern = Pattern::new(&pattern_str)
            .map_err(|e| ToolError::InvalidArguments(format!("Invalid glob pattern: {}", e)))?;

        // Get search root
        let search_root = std::env::current_dir()
            .map_err(|e| ToolError::ExecutionFailed(format!("Failed to get current directory: {}", e)))?;

        // Perform search
        let mut results = Vec::new();
        let mut total_files = 0;

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

            // Check if path is in excluded directories
            let is_excluded = exclude_dirs.iter().any(|excluded| {
                path.components().any(|component| {
                    component.as_os_str().to_str() == Some(excluded.as_str())
                })
            });

            if is_excluded {
                continue;
            }

            total_files += 1;

            // Get relative path from search root
            let relative_path = path.strip_prefix(&search_root).unwrap_or(path);
            let path_str = relative_path.to_str().unwrap_or("");

            // Match against glob pattern
            if glob_pattern.matches(path_str) {
                results.push(path.display().to_string());
            }
        }

        // Sort results alphabetically
        results.sort();

        let message = if results.is_empty() {
            format!("No files found matching pattern '{}' (searched {} files)", pattern_str, total_files)
        } else {
            let truncated = results.len() >= max_results;
            let mut msg = format!(
                "Found {} file{} matching pattern '{}'",
                results.len(),
                if results.len() == 1 { "" } else { "s" },
                pattern_str
            );
            if truncated {
                msg.push_str(&format!(
                    " (limit reached at {}). Consider using more specific patterns.",
                    max_results
                ));
            }
            msg
        };

        Ok(json!({
            "status": "success",
            "message": message,
            "files": results,
            "total_scanned": total_files,
        }))
    }
}

// Implement ToolFactory for bean-style registration
impl_tool_factory!(GlobSearchTool);

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_glob_simple_pattern() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("test1.rs"), "").unwrap();
        fs::write(temp_dir.path().join("test2.rs"), "").unwrap();
        fs::write(temp_dir.path().join("test.txt"), "").unwrap();

        std::env::set_current_dir(temp_dir.path()).unwrap();

        let tool = GlobSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "*.rs",
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        let files = result["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|f| f.as_str().unwrap().ends_with(".rs")));
    }

    #[tokio::test]
    async fn test_glob_recursive_pattern() {
        let temp_dir = TempDir::new().unwrap();
        let src_dir = temp_dir.path().join("src");
        fs::create_dir(&src_dir).unwrap();
        fs::write(src_dir.join("main.rs"), "").unwrap();
        fs::write(temp_dir.path().join("lib.rs"), "").unwrap();

        std::env::set_current_dir(temp_dir.path()).unwrap();

        let tool = GlobSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "**/*.rs",
        }));

        let result = tool.execute(args).await.unwrap();
        let files = result["files"].as_array().unwrap();
        assert!(files.len() >= 2);
    }

    #[tokio::test]
    async fn test_glob_no_matches() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("test.txt"), "").unwrap();

        std::env::set_current_dir(temp_dir.path()).unwrap();

        let tool = GlobSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "*.rs",
        }));

        let result = tool.execute(args).await.unwrap();
        assert_eq!(result["status"], "success");
        assert_eq!(result["files"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_glob_invalid_pattern() {
        let tool = GlobSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "[invalid",
        }));

        let result = tool.execute(args).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_glob_with_exclusions() {
        let temp_dir = TempDir::new().unwrap();
        let node_modules = temp_dir.path().join("node_modules");
        fs::create_dir(&node_modules).unwrap();
        fs::write(node_modules.join("test.js"), "").unwrap();
        fs::write(temp_dir.path().join("main.js"), "").unwrap();

        std::env::set_current_dir(temp_dir.path()).unwrap();

        let tool = GlobSearchTool::new();
        let args = ToolArguments::Json(json!({
            "pattern": "**/*.js",
            "exclude": ["node_modules"],
        }));

        let result = tool.execute(args).await.unwrap();
        let files = result["files"].as_array().unwrap();
        assert!(files.iter().all(|f| !f.as_str().unwrap().contains("node_modules")));
    }
}
