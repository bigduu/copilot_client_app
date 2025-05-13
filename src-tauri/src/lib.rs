use crate::command::chat::{execute_prompt, get_models};
use crate::command::copy::copy_to_clipboard;
use copilot::{client::CopilotClient, config::Config};
use log::LevelFilter;
use tauri::Manager;

mod command;
pub mod copilot;
mod processor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Error)
                .build(),
        )
        .setup(|app| {
            let handle = app.handle();
            let app_data_dir = handle.path().app_data_dir().unwrap();
            let client = CopilotClient::new(Config::new(), app_data_dir);
            app.manage(client);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_prompt,
            copy_to_clipboard,
            get_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
