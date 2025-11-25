//! Tool request and result message types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Tool request message from LLM
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolRequestMessage {
    /// Tool calls requested by the LLM
    pub calls: Vec<ToolCall>,

    /// Approval status
    pub approval_status: ApprovalStatus,

    /// When the request was made
    pub requested_at: DateTime<Utc>,

    /// When approved (if approved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<DateTime<Utc>>,

    /// Who approved (future: user ID)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_by: Option<String>,
}

/// Individual tool call
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// Tool approval status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    #[default]
    Pending,
    Approved,
    Denied,
    AutoApproved,
}

/// Tool execution result message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolResultMessage {
    /// Corresponding tool call request ID
    pub request_id: String,

    /// Tool execution result
    pub result: serde_json::Value,

    /// Execution status
    pub status: ExecutionStatus,

    /// When executed
    pub executed_at: DateTime<Utc>,

    /// Execution duration in milliseconds
    pub duration_ms: u64,

    /// Error details if execution failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

/// Tool execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Success,
    Failed,
    Timeout,
    Cancelled,
}

/// Error details for failed executions
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}
