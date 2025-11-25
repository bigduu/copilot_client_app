//! Path suggestions provider

use super::recent_manager::RecentWorkspaceManager;
use super::types::{PathSuggestion, PathSuggestionsResponse, SuggestionType};
use log::debug;
use std::path::Path;

/// Provides path suggestions for workspaces
pub struct SuggestionProvider;

impl SuggestionProvider {
    pub fn new() -> Self {
        Self
    }

    /// Get path suggestions (system directories + recent workspaces)
    pub async fn get_suggestions(
        &self,
        recent_manager: &RecentWorkspaceManager,
        data_dir: &Path,
    ) -> Result<PathSuggestionsResponse, Box<dyn std::error::Error + Send + Sync>> {
        debug!("Getting path suggestions");

        let mut suggestions = Vec::new();

        // Add system directory suggestions
        suggestions.extend(self.get_system_suggestions());

        // Add recent workspaces
        let recent_workspaces = recent_manager.get_recent(data_dir).await?;
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

    /// Get system directory suggestions (Home, Documents, Desktop, Downloads)
    fn get_system_suggestions(&self) -> Vec<PathSuggestion> {
        let mut suggestions = Vec::new();

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

        suggestions
    }
}
