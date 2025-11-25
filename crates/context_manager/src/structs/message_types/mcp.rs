//! MCP (Model Context Protocol) message types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::tools::{ApprovalStatus, ErrorDetail, ExecutionStatus};

/// MCP tool request message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MCPToolRequestMsg {
    /// MCP server name
    pub server_name: String,

    /// Tool name within the MCP server
    pub tool_name: String,

    /// Tool arguments
    pub arguments: HashMap<String, serde_json::Value>,

    /// Request ID for correlation
    pub request_id: String,

    /// Approval status
    pub approval_status: ApprovalStatus,

    /// When requested
    pub requested_at: DateTime<Utc>,

    /// When approved (if approved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<DateTime<Utc>>,
}

/// MCP tool execution result
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MCPToolResultMsg {
    /// MCP server name
    pub server_name: String,

    /// Tool name
    pub tool_name: String,

    /// Corresponding request ID
    pub request_id: String,

    /// Execution result
    pub result: serde_json::Value,

    /// Execution status
    pub status: ExecutionStatus,

    /// When executed
    pub executed_at: DateTime<Utc>,

    /// Duration in milliseconds
    pub duration_ms: u64,

    /// Error details if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDetail>,
}

/// MCP resource message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MCPResourceMessage {
    /// MCP server name
    pub server_name: String,

    /// Resource URI
    pub resource_uri: String,

    /// Resource content
    pub content: String,

    /// Content MIME type
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    /// When retrieved
    pub retrieved_at: DateTime<Utc>,
}
