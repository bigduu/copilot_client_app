use anyhow::Result;
use log::error;
use mcp_client::client::{McpClient, McpClientManager, McpClientStatus};
use mcp_client::model::McpServersConfig;
use rmcp::model::CallToolRequestParam;
use serde_json::Map;
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use tokio::sync::RwLock;

pub struct McpRuntime {
    config_path: PathBuf,
    config: RwLock<McpServersConfig>,
    manager: RwLock<McpClientManager>,
    status_overrides: RwLock<HashMap<String, McpClientStatus>>,
}

impl McpRuntime {
    pub async fn new(app_data_dir: PathBuf) -> Self {
        let config_path = app_data_dir.join("mcp_servers.json");
        if let Err(e) = fs::create_dir_all(&app_data_dir).await {
            error!("Failed to create app data dir: {}", e);
        }
        if let Err(e) = ensure_config_file(&config_path).await {
            error!("Failed to ensure MCP config file: {}", e);
        }
        let config = match load_config(&config_path).await {
            Ok(config) => config,
            Err(err) => {
                error!("Failed to load MCP config: {}", err);
                McpServersConfig::default()
            }
        };
        let (manager, status_overrides) = build_manager(&config).await;
        Self {
            config_path,
            config: RwLock::new(config),
            manager: RwLock::new(manager),
            status_overrides: RwLock::new(status_overrides),
        }
    }

    pub async fn get_config(&self) -> McpServersConfig {
        match load_config(&self.config_path).await {
            Ok(config) => config,
            Err(err) => {
                error!("Failed to load MCP config: {}", err);
                self.config.read().await.clone()
            }
        }
    }

    pub async fn set_config(&self, config: McpServersConfig) -> Result<()> {
        save_config(&self.config_path, &config).await?;
        self.apply_config(config).await
    }

    pub async fn reload_from_file(&self) -> Result<McpServersConfig> {
        ensure_config_file(&self.config_path).await?;
        let config = load_config(&self.config_path).await?;
        self.apply_config(config.clone()).await?;
        Ok(config)
    }

    pub async fn get_status(&self, name: &str) -> Option<McpClientStatus> {
        if let Some(status) = self.status_overrides.read().await.get(name) {
            return Some(status.clone());
        }
        self.manager.read().await.get_status(name)
    }

    pub async fn list_tools(&self) -> Result<Vec<(String, rmcp::model::Tool)>> {
        let clients: Vec<(String, std::sync::Arc<McpClient>)> = {
            let manager = self.manager.read().await;
            manager
                .clients
                .iter()
                .map(|(name, client)| (name.clone(), client.clone()))
                .collect()
        };
        let mut tools = Vec::new();
        for (name, client) in clients {
            let client_tools = client.list_all_tools().await?;
            for tool in client_tools {
                tools.push((name.clone(), tool));
            }
        }
        Ok(tools)
    }

    pub async fn execute_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        args: Map<String, serde_json::Value>,
    ) -> Result<rmcp::model::CallToolResult> {
        let client = {
            let manager = self.manager.read().await;
            manager.get(server_name)
        };
        let Some(client) = client else {
            return Err(anyhow::anyhow!("MCP server not found: {}", server_name));
        };
        let param = CallToolRequestParam {
            name: tool_name.to_string().into(),
            arguments: Some(args),
        };
        client.call_tool(param).await.map_err(Into::into)
    }

    async fn apply_config(&self, config: McpServersConfig) -> Result<()> {
        let (manager, status_overrides) = build_manager(&config).await;
        *self.config.write().await = config;
        *self.manager.write().await = manager;
        *self.status_overrides.write().await = status_overrides;
        Ok(())
    }
}

async fn ensure_config_file(config_path: &PathBuf) -> Result<()> {
    if fs::metadata(config_path).await.is_err() {
        let config = McpServersConfig::default();
        save_config(config_path, &config).await?;
    }
    Ok(())
}

async fn load_config(config_path: &PathBuf) -> Result<McpServersConfig> {
    let content = fs::read_to_string(config_path).await?;
    Ok(serde_json::from_str(&content)?)
}

async fn save_config(config_path: &PathBuf, config: &McpServersConfig) -> Result<()> {
    let content = serde_json::to_string_pretty(config)?;
    fs::write(config_path, content).await?;
    Ok(())
}

async fn build_manager(
    config: &McpServersConfig,
) -> (McpClientManager, HashMap<String, McpClientStatus>) {
    let mut clients = HashMap::new();
    let mut client_tools = HashMap::new();
    let mut status_overrides = HashMap::new();
    for (name, server_config) in &config.mcp_servers {
        if server_config.disabled.unwrap_or(false) {
            status_overrides.insert(name.clone(), McpClientStatus::Stopped);
            continue;
        }
        match McpClient::new(server_config.clone()).await {
            Ok(client) => {
                let client = std::sync::Arc::new(client);
                match client.list_all_tools().await {
                    Ok(tools) => {
                        for tool in tools {
                            client_tools.insert(tool.name.to_string(), name.clone());
                        }
                    }
                    Err(err) => {
                        error!("Failed to list tools for MCP server {}: {}", name, err);
                    }
                }
                clients.insert(name.clone(), client);
            }
            Err(err) => {
                status_overrides.insert(name.clone(), McpClientStatus::Error(err.to_string()));
            }
        }
    }
    (
        McpClientManager {
            clients,
            client_tools,
        },
        status_overrides,
    )
}

#[cfg(test)]
mod tests {
    use super::McpRuntime;
    use tempfile::tempdir;
    use tokio::fs;

    #[tokio::test]
    async fn creates_default_config_file() {
        let dir = tempdir().unwrap();
        let runtime = McpRuntime::new(dir.path().to_path_buf()).await;
        let config = runtime.get_config().await;
        assert!(config.mcp_servers.is_empty());
        let content = fs::read_to_string(dir.path().join("mcp_servers.json"))
            .await
            .unwrap();
        assert!(content.contains("\"mcpServers\""));
    }
}
