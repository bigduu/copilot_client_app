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
use crate::spotlight::{close_spotlight, send_spotlight_message};
use log::{info, LevelFilter};
use std::path::PathBuf;
use tauri::Manager;
use tauri::{App, Runtime};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_log::{Target, TargetKind};
use web_service::server::run as start_server;

pub mod bodhi_settings;
pub mod claude;

pub mod claude_binary {
    pub use crate::claude::*;
}

pub mod command;
pub mod process;
pub mod proxy_auth_dialog;
pub mod spotlight;

const WEB_SERVICE_PROXY_AUTH_URL: &str = "http://127.0.0.1:8080/v1/bodhi/proxy-auth";
const WEB_SERVICE_PROXY_AUTH_RETRIES: u8 = 8;

async fn push_proxy_auth_to_web_service(
    auth: &proxy_auth_dialog::ProxyAuthInput,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(tokio::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let payload = serde_json::json!({
        "username": auth.username,
        "password": auth.password,
    });

    let mut last_error = String::new();

    for attempt in 1..=WEB_SERVICE_PROXY_AUTH_RETRIES {
        match client
            .post(WEB_SERVICE_PROXY_AUTH_URL)
            .json(&payload)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => {
                log::info!(
                    "Proxy auth sent to web service successfully on attempt {}",
                    attempt
                );
                return Ok(());
            }
            Ok(response) => {
                let status = response.status();
                last_error = format!(
                    "Proxy auth endpoint returned status {} (attempt {})",
                    status, attempt
                );
                log::warn!("{}", last_error);
            }
            Err(e) => {
                last_error = format!(
                    "Failed to call proxy auth endpoint on attempt {}: {}",
                    attempt, e
                );
                log::warn!("{}", last_error);
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    Err(last_error)
}

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
        let mut proxy_auth_applied = false;

        // If proxy is configured but no auth, show dialog
        if !config.http_proxy.is_empty() && config.http_proxy_auth.is_none() {
            log::info!("HTTP proxy configured but no auth, showing dialog...");
            match proxy_auth_dialog::show_proxy_auth_dialog(&app_handle, &config.http_proxy).await {
                proxy_auth_dialog::DialogResult::Auth(auth) => {
                    log::info!("Got proxy auth for HTTP proxy: {}", auth.username);
                    if let Err(e) = push_proxy_auth_to_web_service(&auth).await {
                        log::error!("Failed to send HTTP proxy auth to web_service: {}", e);
                    } else {
                        proxy_auth_applied = true;
                    }

                    // Save to config if remember is true
                    if auth.remember {
                        if let Err(e) = proxy_auth_dialog::save_proxy_auth_to_config("http", &auth)
                        {
                            log::error!("Failed to save HTTP proxy auth: {}", e);
                        }
                    }
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
            if proxy_auth_applied {
                log::info!(
                    "Skipping HTTPS proxy auth dialog because runtime proxy auth was already applied"
                );
            } else {
                log::info!("HTTPS proxy configured but no auth, showing dialog...");
                match proxy_auth_dialog::show_proxy_auth_dialog(&app_handle, &config.https_proxy)
                    .await
                {
                    proxy_auth_dialog::DialogResult::Auth(auth) => {
                        log::info!("Got proxy auth for HTTPS proxy: {}", auth.username);
                        if let Err(e) = push_proxy_auth_to_web_service(&auth).await {
                            log::error!("Failed to send HTTPS proxy auth to web_service: {}", e);
                        }

                        // Save to config if remember is true
                        if auth.remember {
                            if let Err(e) =
                                proxy_auth_dialog::save_proxy_auth_to_config("https", &auth)
                            {
                                log::error!("Failed to save HTTPS proxy auth: {}", e);
                            }
                        }
                    }
                    proxy_auth_dialog::DialogResult::Skip => {
                        log::info!("User skipped HTTPS proxy auth configuration");
                    }
                    proxy_auth_dialog::DialogResult::Cancel => {
                        log::info!("User cancelled HTTPS proxy auth dialog");
                    }
                }
            }
        }
    });

    // Register spotlight global shortcut
    let shortcut = crate::spotlight::get_spotlight_shortcut();
    if let Err(e) = _app.handle().global_shortcut().register(shortcut) {
        log::warn!("Failed to register spotlight shortcut: {}", e);
    } else {
        log::info!("Spotlight shortcut registered: Cmd+Shift+Space");
    }

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

    // Global shortcut plugin with handler
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            crate::spotlight::handle_shortcut(app, shortcut, event.state());
        })
        .build();

    tauri::Builder::default()
        .plugin(fs_plugin)
        .plugin(log_plugin)
        .plugin(dialog_plugin)
        .plugin(global_shortcut_plugin)
        .setup(|app| setup(app))
        .invoke_handler(tauri::generate_handler![
            copy_to_clipboard,
            pick_folder,
            slash_commands_list,
            slash_command_get,
            slash_command_save,
            slash_command_delete,
            save_workflow,
            get_keyword_masking_config,
            update_keyword_masking_config,
            validate_keyword_entries,
            send_spotlight_message,
            close_spotlight
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
