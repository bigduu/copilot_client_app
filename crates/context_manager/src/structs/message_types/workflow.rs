//! Workflow execution message types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::tools::ErrorDetail;

/// Workflow execution message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowExecMsg {
    /// Workflow name
    pub workflow_name: String,

    /// Unique execution ID
    pub execution_id: String,

    /// Current workflow status
    pub status: WorkflowStatus,

    /// Current step being executed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_step: Option<String>,

    /// Total number of steps
    pub total_steps: usize,

    /// Number of completed steps
    pub completed_steps: usize,

    /// When execution started
    pub started_at: DateTime<Utc>,

    /// Last update time
    pub updated_at: DateTime<Utc>,

    /// Final result (if completed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,

    /// Error details (if failed)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

/// Workflow execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}
