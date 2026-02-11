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
use chrono::{SecondsFormat, Utc};
use log::{info, LevelFilter};
use reqwest::StatusCode;
use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;
use tauri::{App, Runtime};
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

const WEB_SERVICE_PROXY_AUTH_URL: &str = "http://127.0.0.1:8080/v1/bodhi/proxy-auth";
const WEB_SERVICE_PROXY_AUTH_RETRIES: u8 = 8;
const SETUP_VERSION: &str = "1.0";

// Note: Active network detection has been removed to avoid security/firewall concerns.
// Proxy detection now only checks environment variables (passive detection).

#[derive(serde::Serialize)]
struct ProxyDetectionResult {
    needs_proxy: bool,
    direct_connection_success: bool,
    message: String,
}

#[derive(serde::Serialize)]
struct SetupStatus {
    is_complete: bool,
    has_proxy_config: bool,
    has_proxy_env: bool,
    message: String,
}

// Note: The following network detection functions are kept for reference but are no longer used.
// Active network detection has been removed to avoid security/firewall concerns.
#[allow(dead_code)]
fn is_proxy_blocking_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::FORBIDDEN | StatusCode::PROXY_AUTHENTICATION_REQUIRED
    )
}

fn collect_proxy_environment_flags() -> Vec<&'static str> {
    ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]
        .iter()
        .copied()
        .filter(|key| {
            std::env::var(key)
                .ok()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
        })
        .collect()
}

fn has_proxy_config(config: &Value) -> bool {
    let has_http_proxy = config
        .get("http_proxy")
        .and_then(|value| value.as_str())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_https_proxy = config
        .get("https_proxy")
        .and_then(|value| value.as_str())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    has_http_proxy || has_https_proxy
}

fn is_setup_completed(config: &Value) -> bool {
    config
        .get("setup")
        .and_then(|setup| setup.get("completed"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn should_show_setup(setup_completed: bool, has_proxy_config: bool, has_proxy_env: bool) -> bool {
    if setup_completed {
        return false;
    }

    if has_proxy_config {
        return false;
    }

    has_proxy_env
}

fn setup_status_message(
    setup_completed: bool,
    has_proxy_config: bool,
    proxy_environment_flags: &[&str],
) -> String {
    if setup_completed {
        return "Setup has already been completed in config.json.".to_string();
    }

    if has_proxy_config {
        return "Proxy configuration already exists in config.json. Setup is not required."
            .to_string();
    }

    if !proxy_environment_flags.is_empty() {
        return format!(
            "Detected proxy environment variables: {}. Please confirm proxy settings in setup.",
            proxy_environment_flags.join(", ")
        );
    }

    "No proxy configuration or proxy environment variables detected. Setup is not required."
        .to_string()
}

fn mark_setup_complete_in_config(config: &mut Value, completed_at: String) -> Result<(), String> {
    let config_obj = config
        .as_object_mut()
        .ok_or_else(|| "config.json must be a JSON object".to_string())?;

    let setup_entry = config_obj
        .entry("setup".to_string())
        .or_insert_with(|| serde_json::json!({}));
    let setup_obj = setup_entry
        .as_object_mut()
        .ok_or_else(|| "config.setup must be a JSON object".to_string())?;

    setup_obj.insert("completed".to_string(), Value::Bool(true));
    setup_obj.insert("completed_at".to_string(), Value::String(completed_at));
    setup_obj.insert(
        "version".to_string(),
        Value::String(SETUP_VERSION.to_string()),
    );

    Ok(())
}

// Note: Kept for reference but no longer used.
#[allow(dead_code)]
fn is_proxy_required_by_signals(
    direct_connection_success: bool,
    proxy_environment_flags: &[&str],
) -> bool {
    !direct_connection_success || !proxy_environment_flags.is_empty()
}

// Note: Active network detection function has been completely removed.
// Passive detection (environment variables only) is used instead.
// This avoids security/firewall concerns from pinging external endpoints.

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

fn read_config_json() -> Result<Value, String> {
    let config_path = bodhi_settings::config_json_path();
    bodhi_settings::load_config_json(&config_path)
}

fn write_config_json(config: &Value) -> Result<(), String> {
    let config_path = bodhi_settings::config_json_path();
    bodhi_settings::write_config_json(&config_path, config)
}

fn read_proxy_auth_from_plain(config: &Value, key: &str) -> Option<chat_core::ProxyAuth> {
    config
        .get(key)
        .cloned()
        .and_then(|value| serde_json::from_value::<chat_core::ProxyAuth>(value).ok())
}

fn read_proxy_auth_from_encrypted(config: &Value, key: &str) -> Option<chat_core::ProxyAuth> {
    let encrypted = config.get(key).and_then(|value| value.as_str())?;

    match chat_core::encryption::decrypt(encrypted) {
        Ok(decrypted) => match serde_json::from_str::<chat_core::ProxyAuth>(&decrypted) {
            Ok(auth) => Some(auth),
            Err(error) => {
                log::warn!(
                    "Failed to parse decrypted proxy auth from {}: {}",
                    key,
                    error
                );
                None
            }
        },
        Err(error) => {
            log::warn!("Failed to decrypt proxy auth from {}: {}", key, error);
            None
        }
    }
}

fn read_proxy_auth_from_config(config: &Value, proxy_type: &str) -> Option<chat_core::ProxyAuth> {
    let encrypted_key = format!("{}_proxy_auth_encrypted", proxy_type);
    if let Some(auth) = read_proxy_auth_from_encrypted(config, &encrypted_key) {
        return Some(auth);
    }

    let plain_key = format!("{}_proxy_auth", proxy_type);
    read_proxy_auth_from_plain(config, &plain_key)
}

fn bodhi_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join(".bodhi")
}

fn should_exit_on_main_window_close(label: &str, is_close_requested: bool) -> bool {
    label == "main" && is_close_requested
}

fn setup<R: Runtime>(app: &mut App<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = bodhi_dir();
    std::fs::create_dir_all(&app_data_dir)?;
    info!("App data dir: {:?}", app_data_dir);

    app.manage(ProcessRegistryState::default());

    let server_data_dir = app_data_dir.clone();
    tauri::async_runtime::spawn(async {
        let _ = start_server(server_data_dir, 8080).await;
    });

    // Keep startup detection/logging, but do not show interactive dialogs.
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let config = chat_core::Config::new();
        let has_http_proxy = !config.http_proxy.trim().is_empty();
        let has_https_proxy = !config.https_proxy.trim().is_empty();

        if !has_http_proxy && !has_https_proxy {
            return;
        }

        log::info!(
            "Proxy is configured. Startup interactive proxy auth is disabled; SetupPage will handle user input."
        );

        let proxy_url = if has_http_proxy {
            config.http_proxy.as_str()
        } else {
            config.https_proxy.as_str()
        };

        match proxy_auth_dialog::show_proxy_auth_dialog(&app_handle, proxy_url).await {
            proxy_auth_dialog::DialogResult::Auth(auth) => {
                log::info!("Applying startup proxy auth from available source");
                if let Err(error) = push_proxy_auth_to_web_service(&auth).await {
                    log::warn!("Failed to apply startup proxy auth: {}", error);
                }

                if auth.remember {
                    if has_http_proxy {
                        if let Err(error) =
                            proxy_auth_dialog::save_proxy_auth_to_config("http", &auth)
                        {
                            log::error!("Failed to save HTTP proxy auth: {}", error);
                        }
                    }
                    if has_https_proxy {
                        if let Err(error) =
                            proxy_auth_dialog::save_proxy_auth_to_config("https", &auth)
                        {
                            log::error!("Failed to save HTTPS proxy auth: {}", error);
                        }
                    }
                }
            }
            proxy_auth_dialog::DialogResult::Skip => {
                log::info!("Skipping startup proxy auth; waiting for SetupPage configuration");
            }
            proxy_auth_dialog::DialogResult::Cancel => {
                log::info!("Startup proxy auth flow cancelled");
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn get_proxy_config() -> Result<serde_json::Value, String> {
    let config = read_config_json()?;

    let http_proxy = config
        .get("http_proxy")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let https_proxy = config
        .get("https_proxy")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();

    let stored_auth = read_proxy_auth_from_config(&config, "http")
        .or_else(|| read_proxy_auth_from_config(&config, "https"));

    let (username, password, remember) = if let Some(auth) = stored_auth {
        (Some(auth.username), Some(auth.password), true)
    } else if let (Ok(env_username), Ok(env_password)) = (
        std::env::var("PROXY_USERNAME"),
        std::env::var("PROXY_PASSWORD"),
    ) {
        (Some(env_username), Some(env_password), false)
    } else {
        (None, None, false)
    };

    Ok(serde_json::json!({
        "http_proxy": http_proxy,
        "https_proxy": https_proxy,
        "username": username,
        "password": password,
        "remember": remember,
    }))
}

/// Get the full bodhi config (config.json content)
#[tauri::command]
async fn get_bodhi_config() -> Result<serde_json::Value, String> {
    read_config_json()
}

#[tauri::command]
async fn get_setup_status() -> Result<SetupStatus, String> {
    let config = read_config_json()?;

    let has_proxy_config = has_proxy_config(&config);
    let proxy_environment_flags = collect_proxy_environment_flags();
    let has_proxy_env = !proxy_environment_flags.is_empty();
    let setup_completed = is_setup_completed(&config);

    let is_complete = !should_show_setup(setup_completed, has_proxy_config, has_proxy_env);
    let message = setup_status_message(setup_completed, has_proxy_config, &proxy_environment_flags);

    Ok(SetupStatus {
        is_complete,
        has_proxy_config,
        has_proxy_env,
        message,
    })
}

#[tauri::command]
async fn mark_setup_complete() -> Result<(), String> {
    let mut config = read_config_json()?;
    let completed_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);

    mark_setup_complete_in_config(&mut config, completed_at)?;
    write_config_json(&config)
}

/// Detect proxy requirement by checking environment variables only.
/// Does NOT make any network requests to avoid security/firewall concerns.
#[tauri::command]
async fn detect_proxy_requirement() -> Result<ProxyDetectionResult, String> {
    // Passive detection: only check environment variables, no network requests
    let proxy_environment_flags = collect_proxy_environment_flags();
    let has_proxy_env = !proxy_environment_flags.is_empty();

    let message = if has_proxy_env {
        format!(
            "Detected proxy environment variables: {}. You may need to configure proxy settings.",
            proxy_environment_flags.join(", ")
        )
    } else {
        "No proxy environment variables detected. You can proceed without proxy or configure one manually if needed.".to_string()
    };

    Ok(ProxyDetectionResult {
        needs_proxy: has_proxy_env,
        direct_connection_success: !has_proxy_env,
        message,
    })
}

#[tauri::command]
async fn set_proxy_config(
    http_proxy: String,
    https_proxy: String,
    username: Option<String>,
    password: Option<String>,
    remember: bool,
) -> Result<(), String> {
    let http_proxy = http_proxy.trim().to_string();
    let https_proxy = https_proxy.trim().to_string();

    let username = username.unwrap_or_default().trim().to_string();
    let password = password.unwrap_or_default();
    let has_auth = !username.is_empty();

    let mut config = read_config_json()?;
    let config_obj = config
        .as_object_mut()
        .ok_or_else(|| "config.json must be a JSON object".to_string())?;

    config_obj.insert("http_proxy".to_string(), Value::String(http_proxy.clone()));
    config_obj.insert(
        "https_proxy".to_string(),
        Value::String(https_proxy.clone()),
    );

    // Never persist plaintext proxy auth fields.
    config_obj.remove("http_proxy_auth");
    config_obj.remove("https_proxy_auth");

    if remember && has_auth {
        let auth = chat_core::ProxyAuth {
            username: username.clone(),
            password: password.clone(),
        };

        let auth_json =
            serde_json::to_string(&auth).map_err(|e| format!("Failed to serialize auth: {}", e))?;
        let encrypted = chat_core::encryption::encrypt(&auth_json)
            .map_err(|e| format!("Failed to encrypt auth: {}", e))?;

        if !http_proxy.is_empty() {
            config_obj.insert(
                "http_proxy_auth_encrypted".to_string(),
                Value::String(encrypted.clone()),
            );
        } else {
            config_obj.remove("http_proxy_auth_encrypted");
        }

        if !https_proxy.is_empty() {
            config_obj.insert(
                "https_proxy_auth_encrypted".to_string(),
                Value::String(encrypted),
            );
        } else {
            config_obj.remove("https_proxy_auth_encrypted");
        }
    } else {
        config_obj.remove("http_proxy_auth_encrypted");
        config_obj.remove("https_proxy_auth_encrypted");
    }

    write_config_json(&config)?;

    // Best effort: sync runtime proxy auth immediately for current session.
    let runtime_auth = proxy_auth_dialog::ProxyAuthInput {
        username: if has_auth { username } else { String::new() },
        password: if has_auth { password } else { String::new() },
        remember: false,
    };
    if let Err(error) = push_proxy_auth_to_web_service(&runtime_auth).await {
        log::warn!(
            "Failed to sync runtime proxy auth after set_proxy_config: {}",
            error
        );
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

    tauri::Builder::default()
        .plugin(fs_plugin)
        .plugin(log_plugin)
        .plugin(dialog_plugin)
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
            get_proxy_config,
            get_setup_status,
            mark_setup_complete,
            detect_proxy_requirement,
            set_proxy_config,
            get_bodhi_config
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: window_event,
                ..
            } = event
            {
                let is_close_requested =
                    matches!(window_event, tauri::WindowEvent::CloseRequested { .. });
                if should_exit_on_main_window_close(&label, is_close_requested) {
                    log::info!("Main window close requested, exiting application...");
                    app_handle.exit(0);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn should_exit_when_main_window_requests_close() {
        assert!(super::should_exit_on_main_window_close("main", true));
    }

    #[test]
    fn should_not_exit_when_non_main_window_requests_close() {
        assert!(!super::should_exit_on_main_window_close("settings", true));
    }

    #[test]
    fn should_not_exit_when_main_window_event_is_not_close_requested() {
        assert!(!super::should_exit_on_main_window_close("main", false));
    }

    #[test]
    fn should_not_show_setup_when_setup_marked_complete() {
        assert!(!super::should_show_setup(true, false, true));
    }

    #[test]
    fn should_not_show_setup_when_proxy_config_exists() {
        assert!(!super::should_show_setup(false, true, true));
    }

    #[test]
    fn should_show_setup_when_proxy_env_detected_without_completion_or_config() {
        assert!(super::should_show_setup(false, false, true));
    }

    #[test]
    fn should_not_show_setup_on_first_start_without_proxy_requirements() {
        assert!(!super::should_show_setup(false, false, false));
    }

    #[test]
    fn has_proxy_config_detects_non_empty_proxy_urls() {
        assert!(super::has_proxy_config(&serde_json::json!({
            "http_proxy": "http://proxy.example.com:8080",
            "https_proxy": ""
        })));

        assert!(super::has_proxy_config(&serde_json::json!({
            "http_proxy": "",
            "https_proxy": "http://proxy.example.com:8080"
        })));
    }

    #[test]
    fn has_proxy_config_ignores_empty_or_whitespace_proxy_urls() {
        assert!(!super::has_proxy_config(&serde_json::json!({
            "http_proxy": "   ",
            "https_proxy": ""
        })));
        assert!(!super::has_proxy_config(&serde_json::json!({})));
    }

    #[test]
    fn mark_setup_complete_in_config_writes_setup_metadata() {
        let mut config = serde_json::json!({
            "http_proxy": "http://proxy.example.com:8080"
        });
        let completed_at = "2024-01-15T10:30:00Z".to_string();

        super::mark_setup_complete_in_config(&mut config, completed_at.clone())
            .expect("setup metadata should be written");

        let setup = config
            .get("setup")
            .expect("setup field should exist after mark setup complete");
        assert_eq!(
            setup.get("completed").and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            setup.get("completed_at").and_then(|value| value.as_str()),
            Some(completed_at.as_str())
        );
        assert_eq!(
            setup.get("version").and_then(|value| value.as_str()),
            Some(super::SETUP_VERSION)
        );
    }

    #[test]
    fn mark_setup_complete_in_config_returns_error_for_non_object_setup_field() {
        let mut config = serde_json::json!({
            "setup": "invalid"
        });

        let error =
            super::mark_setup_complete_in_config(&mut config, "2024-01-15T10:30:00Z".to_string())
                .expect_err("non-object setup field should fail");

        assert_eq!(error, "config.setup must be a JSON object");
    }

    #[test]
    fn mark_setup_complete_in_config_returns_error_for_non_object_root() {
        let mut config = serde_json::json!(["invalid"]);

        let error =
            super::mark_setup_complete_in_config(&mut config, "2024-01-15T10:30:00Z".to_string())
                .expect_err("non-object root should fail");

        assert_eq!(error, "config.json must be a JSON object");
    }
}
