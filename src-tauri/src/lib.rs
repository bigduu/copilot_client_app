use std::sync::Arc;

use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use crate::copilot::{Config, CopilotClient};
use crate::mcp::client::init_all_clients;
use command::mcp::{get_mcp_client_status, get_mcp_servers, set_mcp_servers};
use log::LevelFilter;
use processor::mcp_proceeor::McpProcessor;
use processor::ProcessorManager;
use tauri::{App, Manager, Runtime};

mod command;
pub mod copilot;
pub mod mcp;
mod processor;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    let client = CopilotClient::new(Config::new(), app_data_dir);
    app.manage(client.clone());

    // Initialize MCP processor
    let mcp_processor = McpProcessor::new(Arc::new(client));

    // Initialize processor manager with the MCP processor
    let processor_manager = ProcessorManager::new(vec![Arc::new(mcp_processor)]);
    app.manage(processor_manager);

    tauri::async_runtime::spawn(async {
        let _ = init_all_clients().await;
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_plugin = tauri_plugin_log::Builder::new()
        .level(LevelFilter::Info)
        .build();
    tauri::Builder::default()
        .plugin(log_plugin)
        .setup(|app| setup(app))
        .invoke_handler(tauri::generate_handler![
            execute_prompt,
            copy_to_clipboard,
            get_models,
            get_mcp_servers,
            set_mcp_servers,
            get_mcp_client_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
