use std::sync::Arc;

use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use crate::copilot::{Config, CopilotClient};
use crate::mcp::client::init_all_clients;
use crate::tools::create_registered_tool_manager;
use command::mcp::{get_mcp_client_status, get_mcp_servers, set_mcp_servers};
use log::LevelFilter;
use tauri::{App, Manager, Runtime};

pub mod command;
pub mod copilot;
pub mod mcp;
pub mod tools;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    let client = CopilotClient::new(Config::new(), app_data_dir.clone());
    app.manage(client.clone());

    // Create tool manager using the new registration-based architecture
    let tool_manager = Arc::new(create_registered_tool_manager());

    // Register tool manager with Tauri state management
    app.manage(tool_manager.clone());

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
