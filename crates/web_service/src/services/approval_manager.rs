//! Approval manager for agent-initiated tool calls

use crate::error::AppError;
use crate::services::agent_service::ToolCall as AgentToolCall;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Pending approval request for a tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    /// Unique ID for this approval request
    pub request_id: Uuid,
    /// Session ID for which this approval is requested
    pub session_id: Uuid,
    /// Tool call that needs approval
    pub tool_call: AgentToolCall,
    /// Tool name for display
    pub tool_name: String,
    /// Tool description for display
    pub tool_description: String,
    /// Timestamp when the request was created
    pub created_at: std::time::SystemTime,
}

/// Approval result for a tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalResult {
    pub approved: bool,
    pub reason: Option<String>,
}

/// Thread-safe manager for pending approval requests
#[derive(Debug)]
pub struct ApprovalManager {
    /// Map from request_id to approval request
    requests: Arc<Mutex<HashMap<Uuid, ApprovalRequest>>>,
    /// Map from session_id to current pending request_id
    session_requests: Arc<Mutex<HashMap<Uuid, Uuid>>>,
}

impl ApprovalManager {
    pub fn new() -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            session_requests: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create a new approval request and return its ID
    pub async fn create_request(
        &self,
        session_id: Uuid,
        tool_call: AgentToolCall,
        tool_name: String,
        tool_description: String,
    ) -> Result<Uuid, AppError> {
        let request_id = Uuid::new_v4();
        let request = ApprovalRequest {
            request_id,
            session_id,
            tool_call,
            tool_name,
            tool_description,
            created_at: std::time::SystemTime::now(),
        };

        let mut requests = self.requests.lock().await;
        let mut session_requests = self.session_requests.lock().await;

        // If there's already a pending request for this session, remove it
        if let Some(old_request_id) = session_requests.remove(&session_id) {
            requests.remove(&old_request_id);
        }

        requests.insert(request_id, request);
        session_requests.insert(session_id, request_id);

        Ok(request_id)
    }

    /// Get an approval request by ID
    pub async fn get_request(&self, request_id: &Uuid) -> Option<ApprovalRequest> {
        let requests = self.requests.lock().await;
        requests.get(request_id).cloned()
    }

    /// Get the current pending request for a session
    pub async fn get_session_request(&self, session_id: &Uuid) -> Option<ApprovalRequest> {
        let session_requests = self.session_requests.lock().await;
        if let Some(request_id) = session_requests.get(session_id) {
            let requests = self.requests.lock().await;
            requests.get(request_id).cloned()
        } else {
            None
        }
    }

    /// Approve or reject a request and return the tool call if approved
    pub async fn approve_request(
        &self,
        request_id: &Uuid,
        approved: bool,
        _reason: Option<String>,
    ) -> Result<Option<AgentToolCall>, AppError> {
        let mut requests = self.requests.lock().await;
        let mut session_requests = self.session_requests.lock().await;

        let request = requests.remove(request_id).ok_or_else(|| {
            AppError::InternalError(anyhow::anyhow!("Approval request not found"))
        })?;

        session_requests.remove(&request.session_id);

        if approved {
            Ok(Some(request.tool_call))
        } else {
            Ok(None)
        }
    }

    /// Remove a request (for cleanup)
    pub async fn remove_request(&self, request_id: &Uuid) {
        let mut requests = self.requests.lock().await;
        let mut session_requests = self.session_requests.lock().await;

        if let Some(request) = requests.remove(request_id) {
            session_requests.remove(&request.session_id);
        }
    }

    /// Clean up old requests (older than specified duration)
    pub async fn cleanup_old_requests(&self, max_age: std::time::Duration) {
        let now = std::time::SystemTime::now();
        let mut requests = self.requests.lock().await;
        let mut session_requests = self.session_requests.lock().await;

        let to_remove: Vec<Uuid> = requests
            .iter()
            .filter(|(_, req)| {
                now.duration_since(req.created_at)
                    .unwrap_or(std::time::Duration::ZERO)
                    > max_age
            })
            .map(|(id, _)| *id)
            .collect();

        for request_id in to_remove {
            if let Some(request) = requests.remove(&request_id) {
                session_requests.remove(&request.session_id);
            }
        }
    }
}

impl Default for ApprovalManager {
    fn default() -> Self {
        Self::new()
    }
}

