use crate::checkpoint::state::CheckpointState;
use crate::command::claude_code::{
    cancel_claude_execution, check_auto_checkpoint, check_claude_version, cleanup_old_checkpoints,
    clear_checkpoint_manager, continue_claude_code, create_checkpoint, create_project,
    execute_claude_code, find_claude_md_files, fork_from_checkpoint, get_checkpoint_diff,
    get_checkpoint_settings, get_checkpoint_state_stats, get_claude_binary_path,
    get_claude_session_output, get_claude_settings, get_home_directory, get_hooks_config,
    get_project_sessions, get_recently_modified_files, get_session_jsonl, get_session_timeline,
    list_checkpoints, list_claude_installations, list_claude_projects, list_directory_contents,
    list_project_sessions, list_projects, list_running_claude_sessions, load_session_history,
    open_new_session, read_claude_md_file, resume_claude_code, restore_checkpoint,
    save_claude_md_file, save_claude_settings, save_system_prompt, search_files,
    set_claude_binary_path, track_checkpoint_message, track_session_messages,
    update_checkpoint_settings, update_hooks_config, validate_hook_command,
    get_system_prompt, get_claude_env_vars,
};
use crate::command::copy::copy_to_clipboard;
use crate::command::file_picker::pick_folder;
use crate::command::keyword_masking::{
    get_keyword_masking_config, update_keyword_masking_config, validate_keyword_entries,
};
use crate::command::slash_commands::{
    slash_command_delete, slash_command_get, slash_command_save, slash_commands_list,
};
use crate::process::ProcessRegistryState;
use log::{info, LevelFilter};
use std::path::PathBuf;
use tauri::{App, Runtime};
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use copilot_agent_server::start_server_in_thread;
use web_service::server::run as start_server;

pub mod claude_binary;
pub mod bodhi_settings;
pub mod checkpoint;
pub mod command;
pub mod process;

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

    let checkpoint_state = CheckpointState::new();
    if let Ok(claude_dir) = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory")
        .and_then(|home| {
            let claude_path = home.join(".claude");
            claude_path
                .canonicalize()
                .map_err(|_| "Could not find ~/.claude directory")
        })
    {
        let state_clone = checkpoint_state.clone();
        tauri::async_runtime::spawn(async move {
            state_clone.set_claude_dir(claude_dir).await;
        });
    }
    _app.manage(checkpoint_state);
    _app.manage(ProcessRegistryState::default());

    let server_data_dir = app_data_dir.clone();
    tauri::async_runtime::spawn(async {
        let _ = start_server(server_data_dir, 8080).await;
    });

    let agent_data_dir = app_data_dir.clone();
    let base_url = "http://127.0.0.1:8080/v1".to_string();
    start_server_in_thread(
        8081,
        "openai",
        base_url,
        "".to_string(),
        "tauri".to_string(),
        Some(agent_data_dir),
        true,
    );

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
            pick_folder,
            get_home_directory,
            list_projects,
            create_project,
            get_project_sessions,
            list_claude_projects,
            list_project_sessions,
            get_session_jsonl,
            load_session_history,
            get_claude_settings,
            open_new_session,
            get_system_prompt,
            check_claude_version,
            save_system_prompt,
            save_claude_settings,
            find_claude_md_files,
            read_claude_md_file,
            save_claude_md_file,
            list_directory_contents,
            search_files,
            execute_claude_code,
            continue_claude_code,
            resume_claude_code,
            cancel_claude_execution,
            list_running_claude_sessions,
            get_claude_session_output,
            create_checkpoint,
            restore_checkpoint,
            list_checkpoints,
            fork_from_checkpoint,
            get_session_timeline,
            update_checkpoint_settings,
            get_checkpoint_diff,
            track_checkpoint_message,
            check_auto_checkpoint,
            cleanup_old_checkpoints,
            get_checkpoint_settings,
            clear_checkpoint_manager,
            get_checkpoint_state_stats,
            get_recently_modified_files,
            track_session_messages,
            get_hooks_config,
            update_hooks_config,
            validate_hook_command,
            get_claude_binary_path,
            set_claude_binary_path,
            list_claude_installations,
            get_claude_env_vars,
            slash_commands_list,
            slash_command_get,
            slash_command_save,
            slash_command_delete,
            get_keyword_masking_config,
            update_keyword_masking_config,
            validate_keyword_entries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
