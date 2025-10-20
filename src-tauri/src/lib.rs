use std::sync::Arc;
use tokio::sync::Mutex;

use crate::command::copy::copy_to_clipboard;
use copilot_client::{Config, CopilotClient};
use log::{info, LevelFilter};
use mcp_client::client::init_all_clients;
use tauri::{App, Manager, Runtime};
use web_service::{WebService, WebServiceState};

pub mod command;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    info!("App data dir: {:?}", app_data_dir);
    let client = CopilotClient::new(Config::new(), app_data_dir.clone());
    app.manage(client.clone());

    // Create and manage web service
    let web_service: WebServiceState = Arc::new(Mutex::new(WebService::new()));
    app.manage(web_service.clone());

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
        .level(LevelFilter::Debug)
        .build();
    let dialog_plugin = tauri_plugin_dialog::init();
    let fs_plugin = tauri_plugin_fs::init();
    tauri::Builder::default()
        .plugin(fs_plugin)
        .plugin(log_plugin)
        .plugin(dialog_plugin)
        .setup(|app| setup(app))
        .invoke_handler(tauri::generate_handler![copy_to_clipboard,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
