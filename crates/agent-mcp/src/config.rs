use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Root MCP configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
}

fn default_version() -> u32 {
    1
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            version: 1,
            servers: Vec::new(),
        }
    }
}

/// Single MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Unique identifier for this server
    pub id: String,
    /// Human-readable name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Whether this server is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Transport configuration
    pub transport: TransportConfig,
    /// Request timeout in milliseconds
    #[serde(default = "default_request_timeout")]
    pub request_timeout_ms: u64,
    /// Health check interval in milliseconds
    #[serde(default = "default_healthcheck_interval")]
    pub healthcheck_interval_ms: u64,
    /// Reconnection configuration
    #[serde(default)]
    pub reconnect: ReconnectConfig,
    /// List of allowed tools (empty = all allowed)
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    /// List of denied tools
    #[serde(default)]
    pub denied_tools: Vec<String>,
}

fn default_true() -> bool {
    true
}

fn default_request_timeout() -> u64 {
    60000 // 60 seconds
}

fn default_healthcheck_interval() -> u64 {
    30000 // 30 seconds
}

/// Transport configuration variants
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TransportConfig {
    Stdio(StdioConfig),
    Sse(SseConfig),
}

/// Stdio transport configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StdioConfig {
    /// Command to execute
    pub command: String,
    /// Arguments for the command
    #[serde(default)]
    pub args: Vec<String>,
    /// Working directory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Environment variables
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Startup timeout in milliseconds
    #[serde(default = "default_startup_timeout")]
    pub startup_timeout_ms: u64,
}

fn default_startup_timeout() -> u64 {
    20000 // 20 seconds
}

/// SSE transport configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseConfig {
    /// SSE endpoint URL
    pub url: String,
    /// Additional headers
    #[serde(default)]
    pub headers: Vec<HeaderConfig>,
    /// Connection timeout in milliseconds
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_ms: u64,
}

fn default_connect_timeout() -> u64 {
    10000 // 10 seconds
}

/// HTTP header configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeaderConfig {
    pub name: String,
    pub value: String,
}

/// Reconnection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Initial backoff in milliseconds
    #[serde(default = "default_initial_backoff")]
    pub initial_backoff_ms: u64,
    /// Maximum backoff in milliseconds
    #[serde(default = "default_max_backoff")]
    pub max_backoff_ms: u64,
    /// Maximum reconnection attempts (0 = unlimited)
    #[serde(default)]
    pub max_attempts: u32,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            initial_backoff_ms: 1000,
            max_backoff_ms: 30000,
            max_attempts: 0,
        }
    }
}

fn default_initial_backoff() -> u64 {
    1000
}

fn default_max_backoff() -> u64 {
    30000
}
