use crate::command::copy::copy_to_clipboard;
use log::{info, LevelFilter};
use mcp_client::client::init_all_clients;
use tauri::{App, Manager, Runtime};
use web_service::server::run as start_server;

pub mod command;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    info!("App data dir: {:?}", app_data_dir);

    tauri::async_runtime::spawn(async {
        let _ = init_all_clients().await;
    });

    tauri::async_runtime::spawn(async {
        let _ = start_server(app_data_dir, 8080).await;
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
        .invoke_handler(tauri::generate_handler![copy_to_clipboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
