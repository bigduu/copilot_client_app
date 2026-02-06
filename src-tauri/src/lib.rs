use crate::checkpoint::state::CheckpointState;
use crate::command::claude_code::{
    cancel_claude_execution, check_auto_checkpoint, check_claude_version, cleanup_old_checkpoints,
    clear_checkpoint_manager, continue_claude_code, create_checkpoint, create_project,
    execute_claude_code, find_claude_md_files, fork_from_checkpoint, get_checkpoint_diff,
    get_checkpoint_settings, get_checkpoint_state_stats, get_claude_binary_path,
    get_claude_env_vars, get_claude_session_output, get_claude_settings, get_home_directory,
    get_hooks_config, get_project_sessions, get_recently_modified_files, get_session_jsonl,
    get_session_timeline, get_system_prompt, list_checkpoints, list_claude_installations,
    list_claude_projects, list_directory_contents, list_project_sessions, list_projects,
    list_running_claude_sessions, load_session_history, open_new_session, read_claude_md_file,
    restore_checkpoint, resume_claude_code, save_claude_md_file, save_claude_settings,
    save_system_prompt, search_files, set_claude_binary_path, track_checkpoint_message,
    track_session_messages, update_checkpoint_settings, update_hooks_config, validate_hook_command,
};
use crate::command::copy::copy_to_clipboard;
use crate::command::file_picker::pick_folder;
use crate::command::keyword_masking::{
    get_keyword_masking_config, update_keyword_masking_config, validate_keyword_entries,
};
use crate::command::slash_commands::{
    slash_command_delete, slash_command_get, slash_command_save, slash_commands_list,
};
use crate::command::workflows::save_workflow;
use crate::process::ProcessRegistryState;
use log::{info, LevelFilter};
use std::path::PathBuf;
use tauri::Manager;
use tauri::{App, Runtime};
use tauri_plugin_log::{Target, TargetKind};
use web_service::server::run as start_server;

pub mod bodhi_settings;
pub mod checkpoint;
pub mod claude_binary;
pub mod command;
pub mod process;
pub mod proxy_auth_dialog;

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

    // Check if proxy auth is needed after server starts
    let app_handle = _app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // Wait a bit for server to start
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        // Check config for proxy settings
        let config = chat_core::Config::new();

        // If proxy is configured but no auth, show dialog
        if !config.http_proxy.is_empty() && config.http_proxy_auth.is_none() {
            log::info!("HTTP proxy configured but no auth, showing dialog...");
            match proxy_auth_dialog::show_proxy_auth_dialog(&app_handle, &config.http_proxy).await {
                proxy_auth_dialog::DialogResult::Auth(auth) => {
                    log::info!("Got proxy auth for HTTP proxy: {}", auth.username);
                    // Save to config if remember is true
                    if auth.remember {
                        if let Err(e) = proxy_auth_dialog::save_proxy_auth_to_config("http", &auth)
                        {
                            log::error!("Failed to save HTTP proxy auth: {}", e);
                        }
                    }
                    // TODO: Send auth to web_service via HTTP API
                }
                proxy_auth_dialog::DialogResult::Skip => {
                    log::info!("User skipped HTTP proxy auth configuration");
                    // Continue without auth - proxy may not require it
                }
                proxy_auth_dialog::DialogResult::Cancel => {
                    log::info!("User cancelled HTTP proxy auth dialog");
                    // Continue without auth
                }
            }
        }

        if !config.https_proxy.is_empty() && config.https_proxy_auth.is_none() {
            log::info!("HTTPS proxy configured but no auth, showing dialog...");
            match proxy_auth_dialog::show_proxy_auth_dialog(&app_handle, &config.https_proxy).await
            {
                proxy_auth_dialog::DialogResult::Auth(auth) => {
                    log::info!("Got proxy auth for HTTPS proxy: {}", auth.username);
                    // Save to config if remember is true
                    if auth.remember {
                        if let Err(e) = proxy_auth_dialog::save_proxy_auth_to_config("https", &auth)
                        {
                            log::error!("Failed to save HTTPS proxy auth: {}", e);
                        }
                    }
                    // TODO: Send auth to web_service via HTTP API
                }
                proxy_auth_dialog::DialogResult::Skip => {
                    log::info!("User skipped HTTPS proxy auth configuration");
                }
                proxy_auth_dialog::DialogResult::Cancel => {
                    log::info!("User cancelled HTTPS proxy auth dialog");
                }
            }
        }
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
            save_workflow,
            get_keyword_masking_config,
            update_keyword_masking_config,
            validate_keyword_entries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
