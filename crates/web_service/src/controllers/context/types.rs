//! Shared types and DTOs for context operations

use crate::{dto::ChatContextDTO, models::SendMessageRequestBody};
use serde::{Deserialize, Serialize};

// ============================================================================
// Context Management Types
// ============================================================================

#[derive(Deserialize, Debug)]
pub struct CreateContextRequest {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct CreateContextResponse {
    pub id: String,
}

#[derive(Serialize, Debug)]
pub struct ListContextsResponse {
    pub contexts: Vec<ContextSummary>,
}

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

#[derive(Deserialize, Debug)]
pub struct UpdateContextConfigRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_generate_title: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mermaid_diagrams: Option<bool>,
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

#[derive(Deserialize, Debug)]
pub struct UpdateAgentRoleRequest {
    pub role: String, // "planner" or "actor"
}

// ============================================================================
// Workspace Types
// ============================================================================

#[derive(Deserialize, Debug)]
pub struct WorkspaceUpdateRequest {
    pub workspace_path: String,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceInfoResponse {
    pub workspace_path: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceFileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceFilesResponse {
    pub workspace_path: String,
    pub files: Vec<WorkspaceFileEntry>,
}

// ============================================================================
// Message Types
// ============================================================================

#[derive(Deserialize)]
pub struct MessageQuery {
    pub branch: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub ids: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
pub struct MessageContentQuery {
    pub from_sequence: Option<u64>,
}

// ============================================================================
// Title Generation Types
// ============================================================================

#[derive(Deserialize, Debug, Default)]
pub struct GenerateTitleRequest {
    pub max_length: Option<usize>,
    pub message_limit: Option<usize>,
    pub fallback_title: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct GenerateTitleResponse {
    pub title: String,
}

// ============================================================================
// Streaming Types
// ============================================================================

#[derive(Serialize, Debug)]
pub struct StreamingChunksResponse {
    pub context_id: String,
    pub message_id: String,
    pub chunks: Vec<ChunkDTO>,
    pub current_sequence: u64,
    pub has_more: bool,
}

#[derive(Serialize, Debug)]
pub struct ChunkDTO {
    pub sequence: u64,
    pub delta: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalEvent {
    StateChanged {
        context_id: String,
        new_state: String,
        timestamp: String,
    },
    MessageCreated {
        message_id: String,
        role: String,
    },
    ContentDelta {
        context_id: String,
        message_id: String,
        current_sequence: u64,
        timestamp: String,
    },
    MessageCompleted {
        context_id: String,
        message_id: String,
        final_sequence: u64,
        timestamp: String,
    },
    Heartbeat {
        timestamp: String,
    },
}

// ============================================================================
// Tool Approval Types
// ============================================================================

#[derive(Deserialize, Debug)]
pub struct ApproveToolsRequest {
    pub tool_call_ids: Vec<String>,
}

// ============================================================================
// Action-Based API Types
// ============================================================================

#[derive(Deserialize, Debug, Clone)]
pub struct SendMessageActionRequest {
    #[serde(flatten)]
    pub body: SendMessageRequestBody,
}

#[derive(Serialize, Debug)]
pub struct ActionResponse {
    pub context: ChatContextDTO,
    pub status: String,
}

#[derive(Deserialize, Debug)]
pub struct ApproveToolsActionRequest {
    pub tool_call_ids: Vec<String>,
}
