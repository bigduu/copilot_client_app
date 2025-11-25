//! Path validation logic

use super::types::WorkspaceInfo;
use log::debug;
use std::path::Path;
use std::time::SystemTime;
use tokio::fs;

/// Handles workspace path validation
pub struct PathValidator;

impl PathValidator {
    pub fn new() -> Self {
        Self
    }

    /// Validate if a path is a valid workspace
    pub async fn validate(
        &self,
        path: &str,
    ) -> Result<WorkspaceInfo, Box<dyn std::error::Error + Send + Sync>> {
        debug!("Validating workspace path: {}", path);

        let path_obj = Path::new(path);

        // Check if path exists
        if !path_obj.exists() {
            return Ok(WorkspaceInfo {
                path: path.to_string(),
                is_valid: false,
                error_message: Some("Path does not exist".to_string()),
                file_count: None,
                last_modified: None,
                size_bytes: None,
                workspace_name: None,
                description: None,
                tags: None,
            });
        }

        // Check if it's a directory
        if !path_obj.is_dir() {
            return Ok(WorkspaceInfo {
                path: path.to_string(),
                is_valid: false,
                error_message: Some("Path is not a directory".to_string()),
                file_count: None,
                last_modified: None,
                size_bytes: None,
                workspace_name: None,
                description: None,
                tags: None,
            });
        }

        // Check if we can read the directory
        let metadata = match fs::metadata(path).await {
            Ok(meta) => meta,
            Err(e) => {
                return Ok(WorkspaceInfo {
                    path: path.to_string(),
                    is_valid: false,
                    error_message: Some(format!("Cannot read directory: {}", e)),
                    file_count: None,
                    last_modified: None,
                    size_bytes: None,
                    workspace_name: None,
                    description: None,
                    tags: None,
                });
            }
        };

        // Check if it's likely a workspace (contains common project files)
        let file_count = self.count_files(path).await?;
        let is_likely_workspace = self.is_likely_workspace(path).await;

        // Get workspace name from folder name
        let workspace_name = path_obj
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_string());

        // Get last modified time
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs().to_string());

        let is_valid = file_count > 0 && is_likely_workspace;

        Ok(WorkspaceInfo {
            path: path.to_string(),
            is_valid,
            error_message: if !is_valid && file_count > 0 {
                Some("Directory appears empty or may not be a valid workspace".to_string())
            } else {
                None
            },
            file_count: Some(file_count),
            last_modified,
            size_bytes: None, // Could implement directory size calculation if needed
            workspace_name,
            description: None,
            tags: None,
        })
    }

    /// Count files in a directory recursively (with limit)
    async fn count_files(
        &self,
        path: &str,
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        let path_obj = Path::new(path);
        let mut count = 0;

        let mut entries = fs::read_dir(path_obj).await?;
        while let Some(entry) = entries.next_entry().await? {
            let entry_path = entry.path();
            if entry_path.is_file() {
                count += 1;
            } else if entry_path.is_dir() {
                // Recursively count files in subdirectories (limit to avoid performance issues)
                if count < 1000 {
                    // Limit to prevent performance issues
                    if let Some(path_str) = entry_path.to_str() {
                        count += Box::pin(self.count_files(path_str)).await?;
                    }
                }
            }
        }

        Ok(count)
    }

    /// Check if directory is likely a workspace based on common indicators
    async fn is_likely_workspace(&self, path: &str) -> bool {
        let path_obj = Path::new(path);

        // Check for common workspace/project indicators
        let workspace_indicators = vec![
            "package.json",
            "Cargo.toml",
            "pom.xml",
            "requirements.txt",
            "pyproject.toml",
            "go.mod",
            "composer.json",
            "Gemfile",
            ".git",
            ".gitignore",
            "README.md",
            "src/",
            "lib/",
            "tsconfig.json",
            "webpack.config.js",
            "vite.config.ts",
            "Dockerfile",
            "docker-compose.yml",
            "Makefile",
        ];

        for indicator in workspace_indicators {
            if indicator.ends_with('/') {
                // Check for subdirectory
                let sub_dir = path_obj.join(indicator.trim_end_matches('/'));
                if sub_dir.exists() && sub_dir.is_dir() {
                    return true;
                }
            } else {
                // Check for file
                let file_path = path_obj.join(indicator);
                if file_path.exists() && file_path.is_file() {
                    return true;
                }
            }
        }

        false
    }
}
