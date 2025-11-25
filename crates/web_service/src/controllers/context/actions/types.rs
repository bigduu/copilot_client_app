//! Action API types and DTOs

use crate::{dto::ChatContextDTO, models::SendMessageRequestBody};
use serde::{Deserialize, Serialize};

// ============================================================================
// Request Types
// ============================================================================

#[derive(Deserialize, Debug, Clone)]
pub struct SendMessageActionRequest {
    #[serde(flatten)]
    pub body: SendMessageRequestBody,
}

#[derive(Deserialize, Debug)]
pub struct ApproveToolsActionRequest {
    pub tool_call_ids: Vec<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateAgentRoleRequest {
    pub role: String, // "planner" or "actor"
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Serialize, Debug)]
pub struct ActionResponse {
    pub context: ChatContextDTO,
    pub status: String, // "idle", "awaiting_tool_approval", etc.
}
