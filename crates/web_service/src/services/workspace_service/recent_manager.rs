//! Recent workspaces management

use super::path_validator::PathValidator;
use super::types::{StoredRecentWorkspace, WorkspaceInfo, WorkspaceMetadata};
use log::{debug, error, info};
use std::path::Path;
use tokio::fs;

/// Manages recent workspaces list
pub struct RecentWorkspaceManager {
    path_validator: PathValidator,
}

impl RecentWorkspaceManager {
    pub fn new() -> Self {
        Self {
            path_validator: PathValidator::new(),
        }
    }

    /// Get recent workspaces list
    pub async fn get_recent(
        &self,
        data_dir: &Path,
    ) -> Result<Vec<WorkspaceInfo>, Box<dyn std::error::Error + Send + Sync>> {
        debug!("Loading recent workspaces");

        let recent_workspaces_file = data_dir.join("recent_workspaces.json");

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
            match self.path_validator.validate(&stored.path).await {
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

    /// Add a workspace to the recent list
    pub async fn add_recent(
        &self,
        data_dir: &Path,
        path: &str,
        metadata: Option<WorkspaceMetadata>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        debug!("Adding recent workspace: {}", path);

        let mut workspaces = self.get_recent(data_dir).await?;

        // Remove if already exists
        workspaces.retain(|w| w.path != path);

        // Add to front
        if let Ok(mut workspace_info) = self.path_validator.validate(path).await {
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

                let recent_workspaces_file = data_dir.join("recent_workspaces.json");
                fs::write(recent_workspaces_file, content).await?;

                info!("Added recent workspace: {}", path);
            }
        }

        Ok(())
    }
}
