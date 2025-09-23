use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpRequest {
    pub id: String,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpResponse {
    pub id: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum McpResponseStatus {
    Success,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct McpServersConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    #[serde(default, rename = "autoApprove")]
    pub auto_approve: Option<Vec<String>>,
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default)]
    pub timeout: Option<u64>,
    #[serde(default, rename = "transportType")]
    pub transport_type: Option<String>,
}