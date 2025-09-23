use crate::model::{McpServerConfig, McpServersConfig};
use anyhow::Result;
use log::info;
use once_cell::sync::OnceCell;
use rmcp::model::{CallToolRequestParam, CallToolResult, Tool};
use rmcp::service::{RoleClient, RunningService};
use rmcp::{transport::TokioChildProcess, ServiceExt};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
pub enum McpClientStatus {
    Starting,
    Running,
    Error(String),
    Stopped,
}

pub struct McpClient {
    pub config: McpServerConfig,
    peer: RunningService<RoleClient, ()>,
    status: Arc<Mutex<McpClientStatus>>,
}

impl McpClient {
    pub async fn new(config: McpServerConfig) -> Result<Self> {
        let status = Arc::new(Mutex::new(McpClientStatus::Starting));
        let mut cmd = Command::new(&config.command);
        if let Some(args) = &config.args {
            cmd.args(args);
        }
        if let Some(env) = &config.env {
            for (k, v) in env {
                cmd.env(k, v);
            }
        }
        // Start the MCP service as a child process using the config
        let peer = match ().serve(TokioChildProcess::new(&mut cmd)?).await {
            Ok(peer) => {
                *status.lock().unwrap() = McpClientStatus::Running;
                peer
            }
            Err(e) => {
                *status.lock().unwrap() = McpClientStatus::Error(e.to_string());
                return Err(e.into());
            }
        };
        Ok(Self {
            config,
            peer,
            status,
        })
    }

    pub fn peer_info(&self) -> &dyn std::fmt::Debug {
        self.peer.peer_info()
    }

    pub async fn list_all_tools(&self) -> Result<Vec<Tool>> {
        self.peer.list_all_tools().await.map_err(Into::into)
    }

    pub async fn call_tool(&self, param: CallToolRequestParam) -> Result<CallToolResult> {
        self.peer.call_tool(param).await.map_err(Into::into)
    }

    pub fn get_status(&self) -> McpClientStatus {
        self.status.lock().unwrap().clone()
    }
}

pub struct McpClientManager {
    pub clients: HashMap<String, Arc<McpClient>>,
    pub client_tools: HashMap<String, String>,
}

impl McpClientManager {
    pub async fn new(configs: &HashMap<String, McpServerConfig>) -> Result<Self> {
        let mut clients = HashMap::new();
        for (name, config) in configs {
            let client = McpClient::new(config.clone()).await?;
            clients.insert(name.clone(), Arc::new(client));
        }
        Ok(Self {
            clients,
            client_tools: HashMap::new(),
        })
    }

    pub fn get(&self, name: &str) -> Option<Arc<McpClient>> {
        self.clients.get(name).cloned()
    }

    pub fn get_client_by_tools(&self, tool_name: &str) -> Option<Arc<McpClient>> {
        self.client_tools
            .get(tool_name)
            .map(|name| self.clients.get(name).unwrap().clone())
    }

    pub async fn get_all_clients_tools_list(&self) -> Result<Vec<Tool>> {
        let mut tools = Vec::new();
        for (_name, client) in self.clients.iter() {
            let client_tools = client.list_all_tools().await?;
            tools.extend(client_tools.clone());
        }
        Ok(tools)
    }

    pub fn get_status(&self, name: &str) -> Option<McpClientStatus> {
        self.clients.get(name).map(|c| c.get_status())
    }

    pub async fn add_client(&mut self, name: String, config: McpServerConfig) -> Result<()> {
        let client = McpClient::new(config.clone()).await.unwrap();
        let client = Arc::new(client);
        self.clients.insert(name.clone(), client.clone());
        for tool in client.list_all_tools().await? {
            self.client_tools
                .insert(tool.name.to_string(), name.clone());
        }
        Ok(())
    }
}

pub static MCP_CLIENT_MANAGER: OnceCell<Arc<McpClientManager>> = OnceCell::new();

pub async fn init_all_clients() -> anyhow::Result<()> {
    // Load config from file (same as command/mcp.rs)
    let config_path = std::path::Path::new("mcp_servers.json");
    let config: McpServersConfig = if config_path.exists() {
        let content = std::fs::read_to_string(config_path)?;
        info!("config: {}", content);
        serde_json::from_str(&content)?
    } else {
        McpServersConfig::default()
    };
    let mut manager = McpClientManager::new(&config.mcp_servers).await?;
    for (name, server_config) in config.mcp_servers {
        let _ = manager.add_client(name, server_config).await;
    }
    MCP_CLIENT_MANAGER.set(Arc::new(manager)).ok();
    Ok(())
}

pub fn get_global_manager() -> Option<Arc<McpClientManager>> {
    MCP_CLIENT_MANAGER.get().cloned()
}