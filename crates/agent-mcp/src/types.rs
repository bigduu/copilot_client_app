use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// MCP tool metadata from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// Result of calling an MCP tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCallResult {
    pub content: Vec<McpContentItem>,
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum McpContentItem {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { data: String, mime_type: String },
    #[serde(rename = "resource")]
    Resource { resource: McpResource },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
}

/// Server runtime status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Connecting,
    Ready,
    Degraded,
    Stopped,
    Error,
}

impl std::fmt::Display for ServerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServerStatus::Connecting => write!(f, "connecting"),
            ServerStatus::Ready => write!(f, "ready"),
            ServerStatus::Degraded => write!(f, "degraded"),
            ServerStatus::Stopped => write!(f, "stopped"),
            ServerStatus::Error => write!(f, "error"),
        }
    }
}

/// Runtime information for an MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeInfo {
    pub status: ServerStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connected_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disconnected_at: Option<DateTime<Utc>>,
    pub tool_count: usize,
    pub restart_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_ping_at: Option<DateTime<Utc>>,
}

impl Default for RuntimeInfo {
    fn default() -> Self {
        Self {
            status: ServerStatus::Stopped,
            last_error: None,
            connected_at: None,
            disconnected_at: None,
            tool_count: 0,
            restart_count: 0,
            last_ping_at: None,
        }
    }
}

/// Tool alias mapping
#[derive(Debug, Clone)]
pub struct ToolAlias {
    pub alias: String,
    pub server_id: String,
    pub original_name: String,
}

/// Event emitted by MCP manager
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum McpEvent {
    ServerStatusChanged {
        server_id: String,
        status: ServerStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    ToolsChanged {
        server_id: String,
        tools: Vec<String>,
    },
    ToolExecuted {
        server_id: String,
        tool_name: String,
        success: bool,
    },
}
