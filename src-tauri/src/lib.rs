use std::sync::Arc;

use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use crate::copilot::{Config, CopilotClient};
use crate::mcp::client::init_all_clients;
use crate::processor::tools_processor::ToolsProcessor;
use crate::tools::create_tool_manager;
use command::mcp::{get_mcp_client_status, get_mcp_servers, set_mcp_servers};
use log::LevelFilter;
use processor::mcp_proceeor::McpProcessor;
use processor::ProcessorManager;
use tauri::{App, Manager, Runtime};

pub mod command;
pub mod copilot;
pub mod mcp;
pub mod processor;
pub mod tools;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    let client = CopilotClient::new(Config::new(), app_data_dir);
    app.manage(client.clone());

    // Create tool manager and initialize tools
    let tool_manager = Arc::new(create_tool_manager());

    // Register tool manager with Tauri state management
    app.manage(tool_manager.clone());

    // Initialize MCP processor
    let mcp_processor = McpProcessor::new(Arc::new(client.clone()));

    // Initialize tools processor
    let tools_processor = ToolsProcessor::new(Arc::new(client), tool_manager);

    // Initialize processor manager with all processors
    let processor_manager =
        ProcessorManager::new(vec![Arc::new(mcp_processor), Arc::new(tools_processor)]);
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
    let dialog_plugin = tauri_plugin_dialog::init();
    let fs_plugin = tauri_plugin_fs::init();
    tauri::Builder::default()
        .plugin(fs_plugin)
        .plugin(log_plugin)
        .plugin(dialog_plugin)
        .setup(|app| setup(app))
        .invoke_handler(tauri::generate_handler![
            execute_prompt,
            copy_to_clipboard,
            get_models,
            get_mcp_servers,
            set_mcp_servers,
            get_mcp_client_status,
            command::tools::get_available_tools,
            command::tools::get_tools_documentation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
