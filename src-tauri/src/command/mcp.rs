use mcp_client::client::{McpClientStatus, MCP_CLIENT_MANAGER};
use mcp_client::model::McpServersConfig;
use log::info;
use serde_json;
use std::fs;
use std::path::PathBuf;

const MCP_SERVERS_FILE: &str = "mcp_servers.json";

#[tauri::command]
pub async fn get_mcp_servers() -> Result<McpServersConfig, String> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(McpServersConfig::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: McpServersConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub async fn set_mcp_servers(config: McpServersConfig) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_mcp_client_status(name: String) -> Result<Option<McpClientStatus>, String> {
    info!("get_mcp_client_status: {:?}", name);
    let manager = MCP_CLIENT_MANAGER.get().unwrap();
    Ok(manager.get_status(&name))
}

fn get_config_path() -> PathBuf {
    PathBuf::from(MCP_SERVERS_FILE)
}
