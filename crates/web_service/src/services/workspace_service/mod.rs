//! Workspace Service - Modular workspace management
//!
//! This module handles workspace validation, recent workspace management,
//! and path suggestions using a modular Handler pattern.

mod path_validator;
mod recent_manager;
mod suggestion_provider;
mod types;

// Re-export public types
pub use types::{
    AddRecentRequest, PathSuggestion, PathSuggestionsResponse, SuggestionType, ValidatePathRequest,
    WorkspaceInfo, WorkspaceMetadata,
};

use path_validator::PathValidator;
use recent_manager::RecentWorkspaceManager;
use std::path::PathBuf;
use suggestion_provider::SuggestionProvider;

/// Workspace service - coordinates workspace-related operations
pub struct WorkspaceService {
    data_dir: PathBuf,
    path_validator: PathValidator,
    recent_manager: RecentWorkspaceManager,
    suggestion_provider: SuggestionProvider,
}

impl WorkspaceService {
    /// Create a new workspace service
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            path_validator: PathValidator::new(),
            recent_manager: RecentWorkspaceManager::new(),
            suggestion_provider: SuggestionProvider::new(),
        }
    }

    /// Validate if a path is a valid workspace
    pub async fn validate_path(
        &self,
        path: &str,
    ) -> Result<WorkspaceInfo, Box<dyn std::error::Error + Send + Sync>> {
        self.path_validator.validate(path).await
    }

    /// Get recent workspaces list
    pub async fn get_recent_workspaces(
        &self,
    ) -> Result<Vec<WorkspaceInfo>, Box<dyn std::error::Error + Send + Sync>> {
        self.recent_manager.get_recent(&self.data_dir).await
    }

    /// Add a workspace to the recent list
    pub async fn add_recent_workspace(
        &self,
        path: &str,
        metadata: Option<WorkspaceMetadata>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.recent_manager
            .add_recent(&self.data_dir, path, metadata)
            .await
    }

    /// Get path suggestions for workspace selection
    pub async fn get_path_suggestions(
        &self,
    ) -> Result<PathSuggestionsResponse, Box<dyn std::error::Error + Send + Sync>> {
        self.suggestion_provider
            .get_suggestions(&self.recent_manager, &self.data_dir)
            .await
    }
}
