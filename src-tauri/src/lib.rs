use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use crate::copilot::{Config, CopilotClient};
use log::LevelFilter;
use tauri::{App, Manager, Runtime};

mod command;
pub mod copilot;
mod processor;

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let app_data_dir = handle.path().app_data_dir().unwrap();
    let client = CopilotClient::new(Config::new(), app_data_dir);
    app.manage(client);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_plugin = tauri_plugin_log::Builder::new()
        .level(LevelFilter::Error)
        .build();
    tauri::Builder::default()
        .plugin(log_plugin)
        .setup(|app| setup(app))
        .invoke_handler(tauri::generate_handler![
            execute_prompt,
            copy_to_clipboard,
            get_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
