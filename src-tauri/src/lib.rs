use crate::command::copy::copy_to_clipboard;
use crate::command::claude_code::{
    cancel_claude_execution, continue_claude_code, execute_claude_code, get_claude_binary_path,
    get_session_jsonl, list_claude_projects, list_project_sessions, resume_claude_code,
    set_claude_binary_path, ClaudeCodeProcessState,
};
use log::{info, LevelFilter};
use std::path::PathBuf;
use tauri::{App, Runtime};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use web_service::server::run as start_server;

pub mod command;

fn bodhi_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join(".bodhi")
}

fn setup<R: Runtime>(_app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = bodhi_dir();
    std::fs::create_dir_all(&app_data_dir)?;
    info!("App data dir: {:?}", app_data_dir);

    _app.manage(ClaudeCodeProcessState::default());

    let server_data_dir = app_data_dir.clone();
    tauri::async_runtime::spawn(async {
        let _ = start_server(server_data_dir, 8080).await;
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_plugin = tauri_plugin_log::Builder::new()
        .level(LevelFilter::Debug)
        .clear_targets()
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::Folder {
                path: bodhi_dir().join("logs"),
                file_name: None,
            }),
        ])
        .build();
    let dialog_plugin = tauri_plugin_dialog::init();
    let fs_plugin = tauri_plugin_fs::init();
    tauri::Builder::default()
        .plugin(fs_plugin)
        .plugin(log_plugin)
        .plugin(dialog_plugin)
        .setup(|app| setup(app))
        .invoke_handler(tauri::generate_handler![
            copy_to_clipboard,
            get_claude_binary_path,
            set_claude_binary_path,
            list_claude_projects,
            list_project_sessions,
            get_session_jsonl,
            execute_claude_code,
            continue_claude_code,
            resume_claude_code,
            cancel_claude_execution
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
