//! Workspace service types and data structures

use serde::{Deserialize, Serialize};

/// Workspace information including validation status and metadata
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

/// Stored recent workspace with metadata
#[derive(Debug, Serialize, Deserialize)]
pub(super) struct StoredRecentWorkspace {
    pub path: String,
    #[serde(default)]
    pub metadata: Option<WorkspaceMetadata>,
}

/// Request to validate a workspace path
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidatePathRequest {
    pub path: String,
}

/// Request to add a workspace to recent list
#[derive(Debug, Serialize, Deserialize)]
pub struct AddRecentRequest {
    pub path: String,
    pub metadata: Option<WorkspaceMetadata>,
}

/// Workspace metadata (name, description, tags)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    pub workspace_name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Path suggestions response
#[derive(Debug, Serialize)]
pub struct PathSuggestionsResponse {
    pub suggestions: Vec<PathSuggestion>,
}

/// Individual path suggestion
#[derive(Debug, Serialize)]
pub struct PathSuggestion {
    pub path: String,
    pub name: String,
    pub description: Option<String>,
    pub suggestion_type: SuggestionType,
}

/// Type of path suggestion
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
