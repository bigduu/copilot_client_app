use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tool_system::types::ToolArguments;
use uuid::Uuid;

/// A request from the Assistant to call a single tool.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolCallRequest {
    pub id: String, // Unique ID for this specific call
    pub tool_name: String,
    pub arguments: ToolArguments,
    pub approval_status: ApprovalStatus,

    /// How the tool result should be displayed in the UI
    #[serde(default = "DisplayPreference::default")]
    pub display_preference: DisplayPreference,

    /// Additional UI rendering hints for the frontend
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_hints: Option<HashMap<String, serde_json::Value>>,
}

/// The result of a single tool call execution.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolCallResult {
    pub request_id: String, // Corresponds to ToolCallRequest.id
    pub result: serde_json::Value,
}

/// The lifecycle status of a tool call request.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
}

/// Defines how tool results should be displayed in the UI
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum DisplayPreference {
    /// Default display - show the result normally
    Default,
    /// Show the result in a collapsible component
    Collapsible,
    /// Hide the result from the UI
    Hidden,
}

impl Default for DisplayPreference {
    fn default() -> Self {
        DisplayPreference::Default
    }
}

#[derive(Debug, Clone)]
pub struct PendingToolRequest {
    pub request_id: Uuid,
    pub tool_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CurrentToolExecution {
    pub request_id: Option<Uuid>,
    pub tool_name: String,
    pub attempt: u8,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct ToolExecutionContext {
    pending: Vec<PendingToolRequest>,
    current: Option<CurrentToolExecution>,
}

impl ToolExecutionContext {
    pub fn reset(&mut self) {
        self.pending.clear();
        self.current = None;
    }

    pub fn add_pending(&mut self, request_id: Uuid, tool_name: String) {
        if self
            .pending
            .iter()
            .any(|request| request.request_id == request_id)
        {
            return;
        }

        self.pending.push(PendingToolRequest {
            request_id,
            tool_name,
            created_at: Utc::now(),
        });
    }

    pub fn clear_pending(&mut self) {
        self.pending.clear();
    }

    pub fn pending_snapshot(&self) -> (Vec<Uuid>, Vec<String>) {
        (
            self.pending.iter().map(|p| p.request_id).collect(),
            self.pending.iter().map(|p| p.tool_name.clone()).collect(),
        )
    }

    fn remove_pending(&mut self, request_id: &Uuid) -> Option<PendingToolRequest> {
        if let Some(index) = self
            .pending
            .iter()
            .position(|request| &request.request_id == request_id)
        {
            Some(self.pending.remove(index))
        } else {
            None
        }
    }

    fn remove_pending_by_tool(&mut self, tool_name: &str) -> Option<PendingToolRequest> {
        if let Some(index) = self
            .pending
            .iter()
            .position(|request| request.tool_name == tool_name)
        {
            Some(self.pending.remove(index))
        } else {
            None
        }
    }

    pub fn start_execution(&mut self, tool_name: String, attempt: u8, request_id: Option<Uuid>) {
        if let Some(id) = request_id {
            self.remove_pending(&id);
        } else {
            self.remove_pending_by_tool(&tool_name);
        }

        self.current = Some(CurrentToolExecution {
            request_id,
            tool_name,
            attempt,
            started_at: Utc::now(),
        });
    }

    pub fn current(&self) -> Option<&CurrentToolExecution> {
        self.current.as_ref()
    }

    pub fn update_attempt(&mut self, attempt: u8) {
        if let Some(current) = self.current.as_mut() {
            current.attempt = attempt;
        }
    }

    pub fn complete_execution(&mut self) {
        self.current = None;
    }
}
