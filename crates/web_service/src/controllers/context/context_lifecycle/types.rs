//! Context lifecycle types and DTOs

use serde::{Deserialize, Serialize};

// ============================================================================
// Request Types
// ============================================================================

#[derive(Deserialize, Debug)]
pub struct CreateContextRequest {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateContextConfigRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_generate_title: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mermaid_diagrams: Option<bool>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateAgentRoleRequest {
    pub role: String, // "planner" or "actor"
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Serialize, Debug)]
pub struct CreateContextResponse {
    pub id: String,
}

#[derive(Serialize, Debug)]
pub struct ListContextsResponse {
    pub contexts: Vec<ContextSummary>,
}

#[derive(Serialize, Debug)]
pub struct ContextMetadataResponse {
    pub id: String,
    pub current_state: String,
    pub active_branch_name: String,
    pub message_count: usize,
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub auto_generate_title: bool,
    pub mermaid_diagrams: bool,
}

// ============================================================================
// DTO Types
// ============================================================================

#[derive(Serialize, Debug)]
pub struct ContextSummary {
    pub id: String,
    pub config: ConfigSummary,
    pub current_state: String,
    pub active_branch_name: String,
    pub message_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub auto_generate_title: bool,
}

#[derive(Serialize, Debug)]
pub struct ConfigSummary {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}
