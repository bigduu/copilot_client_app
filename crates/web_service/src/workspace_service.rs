use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::SystemTime;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub path: String,
    pub is_valid: bool,
    pub error_message: Option<String>,
    pub file_count: Option<usize>,
    pub last_modified: Option<String>,
    pub size_bytes: Option<u64>,
    pub workspace_name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredRecentWorkspace {
    path: String,
    #[serde(default)]
    metadata: Option<WorkspaceMetadata>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidatePathRequest {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddRecentRequest {
    pub path: String,
    pub metadata: Option<WorkspaceMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    pub workspace_name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct PathSuggestionsResponse {
    pub suggestions: Vec<PathSuggestion>,
}

#[derive(Debug, Serialize)]
pub struct PathSuggestion {
    pub path: String,
    pub name: String,
    pub description: Option<String>,
    pub suggestion_type: SuggestionType,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SuggestionType {
    Recent,
    Common,
    Home,
    Documents,
    Desktop,
    Downloads,
}

pub struct WorkspaceService {
    data_dir: std::path::PathBuf,
}

impl WorkspaceService {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        Self { data_dir }
    }

    pub async fn validate_path(
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

    pub async fn get_recent_workspaces(
        &self,
    ) -> Result<Vec<WorkspaceInfo>, Box<dyn std::error::Error + Send + Sync>> {
        debug!("Loading recent workspaces");

        let recent_workspaces_file = self.data_dir.join("recent_workspaces.json");

        if !recent_workspaces_file.exists() {
            return Ok(vec![]);
        }

        let content = fs::read_to_string(recent_workspaces_file).await?;

        // Try to parse as new format first, then fall back to old format (list of strings)
        let stored_workspaces: Vec<StoredRecentWorkspace> = match serde_json::from_str(&content) {
            Ok(workspaces) => workspaces,
            Err(_) => {
                // Try parsing as old format (Vec<String>)
                match serde_json::from_str::<Vec<String>>(&content) {
                    Ok(paths) => paths
                        .into_iter()
                        .map(|path| StoredRecentWorkspace {
                            path,
                            metadata: None,
                        })
                        .collect(),
                    Err(e) => return Err(Box::new(e)),
                }
            }
        };

        let mut recent_workspaces = Vec::new();
        for stored in stored_workspaces {
            match self.validate_path(&stored.path).await {
                Ok(mut workspace_info) => {
                    if workspace_info.is_valid {
                        // Apply metadata overrides
                        if let Some(meta) = &stored.metadata {
                            if let Some(name) = &meta.workspace_name {
                                workspace_info.workspace_name = Some(name.clone());
                            }
                            if let Some(desc) = &meta.description {
                                workspace_info.description = Some(desc.clone());
                            }
                            if let Some(tags) = &meta.tags {
                                workspace_info.tags = Some(tags.clone());
                            }
                        }
                        recent_workspaces.push(workspace_info);
                    }
                }
                Err(e) => {
                    error!("Error validating recent workspace '{}': {}", stored.path, e);
                    // Continue with other workspaces
                }
            }
        }

        Ok(recent_workspaces)
    }

    pub async fn add_recent_workspace(
        &self,
        path: &str,
        metadata: Option<WorkspaceMetadata>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        debug!("Adding recent workspace: {}", path);

        // Get existing workspaces (this will load and validate them)
        // We need to load the raw stored workspaces to preserve metadata for existing ones
        // But get_recent_workspaces returns WorkspaceInfo which has merged metadata.
        // To simplify, we can just load, modify, and save.

        // However, get_recent_workspaces validates paths. If a path is invalid, it's dropped.
        // We might want to keep invalid paths in history? Usually recent list filters them out.
        // Let's stick to the current behavior: load valid ones, add new one, save.

        let mut workspaces = self.get_recent_workspaces().await?;

        // Remove if already exists
        workspaces.retain(|w| w.path != path);

        // Add to front
        if let Ok(mut workspace_info) = self.validate_path(path).await {
            if workspace_info.is_valid {
                // Apply new metadata
                if let Some(meta) = &metadata {
                    if let Some(name) = &meta.workspace_name {
                        workspace_info.workspace_name = Some(name.clone());
                    }
                    if let Some(desc) = &meta.description {
                        workspace_info.description = Some(desc.clone());
                    }
                    if let Some(tags) = &meta.tags {
                        workspace_info.tags = Some(tags.clone());
                    }
                }

                workspaces.insert(0, workspace_info);

                // Keep only the most recent 10
                workspaces.truncate(10);

                // Save to file
                let stored_workspaces: Vec<StoredRecentWorkspace> = workspaces
                    .iter()
                    .map(|w| StoredRecentWorkspace {
                        path: w.path.clone(),
                        metadata: Some(WorkspaceMetadata {
                            workspace_name: w.workspace_name.clone(),
                            description: w.description.clone(),
                            tags: w.tags.clone(),
                        }),
                    })
                    .collect();

                let content = serde_json::to_string_pretty(&stored_workspaces)?;

                let recent_workspaces_file = self.data_dir.join("recent_workspaces.json");
                fs::write(recent_workspaces_file, content).await?;

                info!("Added recent workspace: {}", path);
            }
        }

        Ok(())
    }

    pub async fn get_path_suggestions(
        &self,
    ) -> Result<PathSuggestionsResponse, Box<dyn std::error::Error + Send + Sync>> {
        debug!("Getting path suggestions");

        let mut suggestions = Vec::new();

        // Add common directories
        if let Some(home_dir) = dirs::home_dir() {
            // Home directory
            suggestions.push(PathSuggestion {
                path: home_dir.to_string_lossy().to_string(),
                name: "Home".to_string(),
                description: Some("Your home directory".to_string()),
                suggestion_type: SuggestionType::Home,
            });

            // Documents
            let documents_dir = home_dir.join("Documents");
            if documents_dir.exists() {
                suggestions.push(PathSuggestion {
                    path: documents_dir.to_string_lossy().to_string(),
                    name: "Documents".to_string(),
                    description: Some("Your documents folder".to_string()),
                    suggestion_type: SuggestionType::Documents,
                });
            }

            // Desktop
            let desktop_dir = home_dir.join("Desktop");
            if desktop_dir.exists() {
                suggestions.push(PathSuggestion {
                    path: desktop_dir.to_string_lossy().to_string(),
                    name: "Desktop".to_string(),
                    description: Some("Your desktop folder".to_string()),
                    suggestion_type: SuggestionType::Desktop,
                });
            }

            // Downloads
            let downloads_dir = home_dir.join("Downloads");
            if downloads_dir.exists() {
                suggestions.push(PathSuggestion {
                    path: downloads_dir.to_string_lossy().to_string(),
                    name: "Downloads".to_string(),
                    description: Some("Your downloads folder".to_string()),
                    suggestion_type: SuggestionType::Downloads,
                });
            }
        }

        // Add recent workspaces
        let recent_workspaces = self.get_recent_workspaces().await?;
        for workspace in recent_workspaces.into_iter().take(5) {
            if let Some(name) = workspace.workspace_name.clone() {
                suggestions.push(PathSuggestion {
                    path: workspace.path.clone(),
                    name,
                    description: Some("Recently used workspace".to_string()),
                    suggestion_type: SuggestionType::Recent,
                });
            }
        }

        Ok(PathSuggestionsResponse { suggestions })
    }

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
