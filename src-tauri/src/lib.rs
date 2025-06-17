use std::sync::Arc;

use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use crate::copilot::{Config, CopilotClient};
use crate::mcp::client::init_all_clients;
use crate::tools::create_tool_manager_with_config_dir;
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

    // Create tool manager and initialize tools with proper config directory
    let tool_manager = Arc::new(create_tool_manager_with_config_dir(app_data_dir));

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
            command::tools::get_available_tools,
            command::tools::get_tools_documentation,
            command::tools::get_tools_for_ui,
            command::tools::execute_tool,
            // 新的工具配置管理命令
            command::tools::get_available_tool_configs,
            command::tools::get_tool_config_by_name,
            command::tools::update_tool_config_by_name,
            command::tools::get_tool_categories_list,
            command::tools::get_tools_by_category,
            command::tools::is_tool_enabled_check,
            command::tools::tool_requires_approval_check,
            command::tools::get_tool_permissions,
            command::tools::reset_tool_configs_to_defaults,
            command::tools::export_tool_configs,
            command::tools::import_tool_configs,
            // 新的 Category 管理 API
            command::tools::get_tool_categories,
            command::tools::get_category_tools,
            command::tools::update_category_config,
            command::tools::register_tool_to_category,
            command::tools::get_tool_category_info,
            // 新架构优化的 API
            command::tools::get_enabled_categories_with_priority,
            command::tools::get_tool_manager_stats,
            command::tools::is_category_enabled,
            command::tools::get_category_system_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
