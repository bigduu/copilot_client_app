use std::sync::Arc;
use tokio::sync::Mutex;

use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use crate::command::web_service::{get_web_service_status, WebServiceState};
use crate::copilot::{Config, CopilotClient};
use crate::extension_system::create_tools_manager;
use crate::mcp::client::init_all_clients;
use crate::web_service::WebService;
use command::mcp::{get_mcp_client_status, get_mcp_servers, set_mcp_servers};
use log::LevelFilter;
use tauri::{App, Manager, Runtime};

pub mod command;
pub mod copilot;
pub mod extension_system;
pub mod mcp;
pub mod web_service;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    let client = CopilotClient::new(Config::new(), app_data_dir.clone());
    app.manage(client.clone());

    // Create and manage web service
    let web_service: WebServiceState = Arc::new(Mutex::new(WebService::new()));
    app.manage(web_service.clone());

    // Create tool manager using the new extension system
    let tool_manager = Arc::new(create_tools_manager());

    // Register tool manager with Tauri state management
    app.manage(tool_manager.clone());

    // Start web service automatically
    let client_for_web = Arc::new(client.clone());
    tauri::async_runtime::spawn(async move {
        let mut service = web_service.lock().await;
        if let Err(e) = service.start(client_for_web).await {
            log::error!("Failed to start web service automatically: {}", e);
        } else {
            log::info!("Web service started automatically on http://127.0.0.1:8080");
        }
    });

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
            // Web service status (read-only)
            get_web_service_status,
            // Core tool system API
            command::tools::get_available_tools,
            command::tools::get_tools_documentation,
            command::tools::get_tools_for_ui,
            command::tools::execute_tool,
            // Category management API
            command::tools::get_tool_categories,
            command::tools::get_category_tools,
            command::tools::get_tool_category_info,
            // Utility API
            command::tools::get_tool_manager_stats,
            command::tools::is_category_enabled,
            command::tools::get_category_system_prompt,
            // Scheduled Task Commands
            command::scheduled_task::fs_read_file,
            command::scheduled_task::fs_write_file,
            command::scheduled_task::fs_list_dir,
            command::scheduled_task::fs_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
