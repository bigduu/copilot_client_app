use chrono::Utc;
use dashmap::DashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};
use tracing::{debug, error, info, warn};

use crate::config::{McpConfig, McpServerConfig, TransportConfig};
use crate::error::{McpError, Result};
use crate::protocol::{McpProtocolClient, McpTransport};
use crate::tool_index::ToolIndex;
use crate::transports::{SseTransport, StdioTransport};
use crate::types::{McpEvent, McpTool, RuntimeInfo, ServerStatus};

/// Runtime state for a connected MCP server
struct ServerRuntime {
    config: McpServerConfig,
    client: RwLock<McpProtocolClient>,
    info: RwLock<RuntimeInfo>,
    tools: RwLock<Vec<McpTool>>,
    shutdown: AtomicBool,
}

/// Manages MCP server connections and tool execution
pub struct McpServerManager {
    runtimes: DashMap<String, Arc<ServerRuntime>>,
    index: Arc<ToolIndex>,
    event_tx: Option<tokio::sync::mpsc::Sender<McpEvent>>,
}

impl McpServerManager {
    pub fn new() -> Self {
        Self {
            runtimes: DashMap::new(),
            index: Arc::new(ToolIndex::new()),
            event_tx: None,
        }
    }

    pub fn with_event_channel(mut self, tx: tokio::sync::mpsc::Sender<McpEvent>) -> Self {
        self.event_tx = Some(tx);
        self
    }

    pub fn tool_index(&self) -> Arc<ToolIndex> {
        self.index.clone()
    }

    /// Initialize from configuration
    pub async fn initialize_from_config(&self,
        config: &McpConfig,
    ) {
        for server_config in &config.servers {
            if !server_config.enabled {
                continue;
            }

            if let Err(e) = self.start_server(server_config.clone()).await {
                error!(
                    "Failed to start MCP server '{}': {}",
                    server_config.id, e
                );
            }
        }
    }

    /// Start a new MCP server connection
    pub async fn start_server(&self,
        config: McpServerConfig,
    ) -> Result<()> {
        let server_id = config.id.clone();

        if self.runtimes.contains_key(&server_id) {
            return Err(McpError::AlreadyRunning(server_id));
        }

        info!("Starting MCP server '{}'", server_id);

        // Create transport
        let transport: Box<dyn McpTransport> = match &config.transport {
            TransportConfig::Stdio(stdio_config) => {
                Box::new(StdioTransport::new(stdio_config.clone()))
            }
            TransportConfig::Sse(sse_config) => {
                Box::new(SseTransport::new(sse_config.clone()))
            }
        };

        // Create client
        let mut client = McpProtocolClient::new(transport);

        // Connect
        client.connect().await.map_err(|e| {
            error!("Failed to connect to MCP server '{}': {}", server_id, e);
            e
        })?;

        // Initialize
        let init_result = client
            .initialize(config.request_timeout_ms)
            .await
            .map_err(|e| {
                error!(
                    "Failed to initialize MCP server '{}': {}",
                    server_id, e
                );
                e
            })?;

        info!(
            "MCP server '{}' initialized: {} v{}",
            server_id, init_result.server_info.name, init_result.server_info.version
        );

        // List tools
        let tools = client.list_tools(config.request_timeout_ms).await?;
        info!(
            "MCP server '{}' has {} tools",
            server_id,
            tools.len()
        );

        // Create runtime
        let runtime = Arc::new(ServerRuntime {
            config: config.clone(),
            client: RwLock::new(client),
            info: RwLock::new(RuntimeInfo {
                status: ServerStatus::Ready,
                last_error: None,
                connected_at: Some(Utc::now()),
                disconnected_at: None,
                tool_count: tools.len(),
                restart_count: 0,
                last_ping_at: Some(Utc::now()),
            }),
            tools: RwLock::new(tools.clone()),
            shutdown: AtomicBool::new(false),
        });

        // Register tools in index
        let aliases = self.index.register_server_tools(
            &server_id,
            &tools,
            &config.allowed_tools,
            &config.denied_tools,
        );

        info!(
            "Registered {} MCP tools for server '{}'",
            aliases.len(),
            server_id
        );

        // Store runtime
        self.runtimes.insert(server_id.clone(), runtime.clone());

        // Emit event
        if let Some(ref tx) = self.event_tx {
            let _ = tx
                .send(McpEvent::ServerStatusChanged {
                    server_id: server_id.clone(),
                    status: ServerStatus::Ready,
                    error: None,
                })
                .await;

            let tool_names: Vec<String> = aliases
                .into_iter()
                .map(|a| a.alias)
                .collect();
            let _ = tx
                .send(McpEvent::ToolsChanged {
                    server_id,
                    tools: tool_names,
                })
                .await;
        }

        // Start health check task
        self.start_health_check(runtime, config.healthcheck_interval_ms);

        Ok(())
    }

    /// Stop an MCP server connection
    pub async fn stop_server(&self,
        server_id: &str,
    ) -> Result<()> {
        let (_, runtime) = self
            .runtimes
            .remove(server_id)
            .ok_or_else(|| McpError::NotRunning(server_id.to_string()))?;

        info!("Stopping MCP server '{}'", server_id);

        runtime.shutdown.store(true, Ordering::SeqCst);

        // Disconnect client
        let mut client = runtime.client.write().await;
        if let Err(e) = client.disconnect().await {
            warn!("Error disconnecting MCP server '{}': {}", server_id, e);
        }

        // Update info
        let mut info = runtime.info.write().await;
        info.status = ServerStatus::Stopped;
        info.disconnected_at = Some(Utc::now());

        // Remove tools from index
        self.index.remove_server_tools(server_id);

        // Emit event
        if let Some(ref tx) = self.event_tx {
            let _ = tx
                .send(McpEvent::ServerStatusChanged {
                    server_id: server_id.to_string(),
                    status: ServerStatus::Stopped,
                    error: None,
                })
                .await;
        }

        info!("MCP server '{}' stopped", server_id);
        Ok(())
    }

    /// Call a tool on a specific server
    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<crate::types::McpCallResult> {
        let runtime = self
            .runtimes
            .get(server_id)
            .ok_or_else(|| McpError::ServerNotFound(server_id.to_string()))?;

        let client = runtime.client.read().await;
        let timeout = runtime.config.request_timeout_ms;

        let result = client.call_tool(tool_name, args, timeout).await?;

        // Emit event
        if let Some(ref tx) = self.event_tx {
            let _ = tx
                .send(McpEvent::ToolExecuted {
                    server_id: server_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: !result.is_error,
                })
                .await;
        }

        Ok(result)
    }

    /// Get tool info for a specific tool
    pub fn get_tool_info(
        &self,
        server_id: &str,
        tool_name: &str,
    ) -> Option<McpTool> {
        self.runtimes.get(server_id).and_then(|runtime| {
            let tools = runtime.tools.try_read().ok()?;
            tools.iter().find(|t| t.name == tool_name).cloned()
        })
    }

    /// Refresh tools from a server
    pub async fn refresh_tools(
        &self,
        server_id: &str,
    ) -> Result<()> {
        let runtime = self
            .runtimes
            .get(server_id)
            .ok_or_else(|| McpError::ServerNotFound(server_id.to_string()))?;

        info!("Refreshing tools for MCP server '{}'", server_id);

        let client = runtime.client.read().await;
        let new_tools = client
            .list_tools(runtime.config.request_timeout_ms)
            .await?;
        drop(client);

        // Update tools
        let mut tools = runtime.tools.write().await;
        *tools = new_tools.clone();
        drop(tools);

        // Update info
        let mut info = runtime.info.write().await;
        info.tool_count = new_tools.len();

        // Re-register tools
        self.index.remove_server_tools(server_id);
        let aliases = self.index.register_server_tools(
            server_id,
            &new_tools,
            &runtime.config.allowed_tools,
            &runtime.config.denied_tools,
        );

        info!(
            "Refreshed {} tools for MCP server '{}'",
            aliases.len(),
            server_id
        );

        // Emit event
        if let Some(ref tx) = self.event_tx {
            let tool_names: Vec<String> = aliases
                .into_iter()
                .map(|a| a.alias)
                .collect();
            let _ = tx
                .send(McpEvent::ToolsChanged {
                    server_id: server_id.to_string(),
                    tools: tool_names,
                })
                .await;
        }

        Ok(())
    }

    /// Get all server IDs
    pub fn list_servers(&self) -> Vec<String> {
        self.runtimes
            .iter()
            .map(|entry| entry.key().clone())
            .collect()
    }

    /// Get runtime info for a server
    pub fn get_server_info(&self,
        server_id: &str,
    ) -> Option<RuntimeInfo> {
        self.runtimes.get(server_id).and_then(|runtime| {
            runtime.info.try_read().ok().map(|info| info.clone())
        })
    }

    /// Check if a server is running
    pub fn is_server_running(&self,
        server_id: &str,
    ) -> bool {
        self.runtimes.contains_key(server_id)
    }

    /// Shutdown all servers
    pub async fn shutdown_all(&self,
    ) {
        let server_ids: Vec<String> = self.list_servers();
        for server_id in server_ids {
            if let Err(e) = self.stop_server(&server_id).await {
                error!("Error stopping server '{}': {}", server_id, e);
            }
        }
    }

    fn start_health_check(
        &self,
        runtime: Arc<ServerRuntime>,
        interval_ms: u64,
    ) {
        let server_id = runtime.config.id.clone();

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(interval_ms));

            loop {
                interval.tick().await;

                if runtime.shutdown.load(Ordering::SeqCst) {
                    break;
                }

                let client = runtime.client.read().await;
                match client.ping(runtime.config.request_timeout_ms).await {
                    Ok(_) => {
                        let mut info = runtime.info.write().await;
                        info.last_ping_at = Some(Utc::now());
                        if info.status == ServerStatus::Degraded {
                            info.status = ServerStatus::Ready;
                        }
                    }
                    Err(e) => {
                        warn!(
                            "Health check failed for MCP server '{}': {}",
                            server_id, e
                        );
                        let mut info = runtime.info.write().await;
                        info.status = ServerStatus::Degraded;
                        info.last_error = Some(e.to_string());
                    }
                }
            }
        });
    }
}

impl Default for McpServerManager {
    fn default() -> Self {
        Self::new()
    }
}
