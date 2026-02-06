use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Proxy authentication info collected from dialog
#[derive(Debug, Clone)]
pub struct ProxyAuthInput {
    pub username: String,
    pub password: String,
    /// Whether to remember (encrypt and store) the credentials
    pub remember: bool,
}

/// Dialog result
pub enum DialogResult {
    /// User provided auth
    Auth(ProxyAuthInput),
    /// User chose to skip
    Skip,
    /// User cancelled
    Cancel,
}

/// Show proxy authentication dialog
/// Returns None if user cancels or skips
pub async fn show_proxy_auth_dialog(
    app: &AppHandle,
    proxy_url: &str,
) -> DialogResult {
    // First, check environment variables (non-interactive mode)
    if let Ok(username) = std::env::var("PROXY_USERNAME") {
        if let Ok(password) = std::env::var("PROXY_PASSWORD") {
            log::info!("Using proxy auth from environment variables");
            return DialogResult::Auth(ProxyAuthInput {
                username,
                password,
                remember: false, // Env vars are not persisted
            });
        }
    }

    // Show confirmation dialog with Skip option
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    app.dialog()
        .message(format!(
            "Proxy authentication may be required for:\n{}\n\n\
            - Click 'Configure' to enter credentials\n\
            - Click 'Skip' if your proxy doesn't require auth\n\
            - Set PROXY_USERNAME and PROXY_PASSWORD env vars to skip this dialog",
            proxy_url
        ))
        .title("Proxy Authentication")
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
            "Configure".to_string(),
            "Skip".to_string(),
        ))
        .show(move |result| {
            let _ = tx.send(result);
        });

    match rx.await {
        Ok(true) => {
            // User clicked "Configure"
            log::info!("User chose to configure proxy auth");
            // Open input dialog for username/password
            show_proxy_auth_input_dialog(app, proxy_url).await
        }
        Ok(false) => {
            // User clicked "Skip"
            log::info!("User skipped proxy auth configuration");
            DialogResult::Skip
        }
        Err(_) => {
            // Dialog failed
            log::warn!("Proxy auth dialog failed");
            DialogResult::Cancel
        }
    }
}

/// Show proxy auth input dialog (username/password)
async fn show_proxy_auth_input_dialog(
    app: &AppHandle,
    proxy_url: &str,
) -> DialogResult {
    // For now, use a simple approach with multiple dialogs
    // In production, this should be a custom window with input fields
    
    // Show info about input method
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    app.dialog()
        .message(format!(
            "Please enter your proxy credentials:\n\n\
            Proxy: {}\n\n\
            You will be prompted for:\n\
            1. Username\n\
            2. Password\n\
            3. Whether to remember credentials\n\n\
            Note: Credentials will be encrypted if you choose to remember them.",
            proxy_url
        ))
        .title("Enter Proxy Credentials")
        .ok_button_label("Continue")
        .show(move |result| {
            let _ = tx.send(result);
        });

    match rx.await {
        Ok(true) => {
            // Continue to input dialogs
            // TODO: Implement proper input dialogs or custom window
            // For now, fall back to environment variable prompt
            log::warn!("Input dialog not fully implemented, falling back to env vars");
            
            // Show a message about using env vars as workaround
            let (tx2, rx2) = tokio::sync::oneshot::channel();
            app.dialog()
                .message(
                    "Please set the following environment variables and restart:\n\n\
                    PROXY_USERNAME=your_username\n\
                    PROXY_PASSWORD=your_password\n\n\
                    Or use the HTTP API to configure proxy auth."
                )
                .title("Configuration Required")
                .ok_button_label("OK")
                .show(move |result| {
                    let _ = tx2.send(result);
                });
            
            let _ = rx2.await;
            DialogResult::Cancel
        }
        _ => DialogResult::Cancel,
    }
}

/// Save proxy auth to config file (encrypted)
pub fn save_proxy_auth_to_config(
    proxy_type: &str,
    auth: &ProxyAuthInput,
) -> Result<(), String> {
    if !auth.remember {
        log::info!("Not saving proxy auth (remember=false)");
        return Ok(());
    }

    use crate::bodhi_settings::config_json_path;
    use chat_core::ProxyAuth;
    
    let config_path = config_json_path();
    
    // Read existing config
    let mut config: serde_json::Value = if config_path.exists() {
        std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    // Create proxy auth object
    let proxy_auth = ProxyAuth {
        username: auth.username.clone(),
        password: auth.password.clone(),
    };
    
    // Encrypt and store
    let auth_json = serde_json::to_string(&proxy_auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;
    
    let encrypted = chat_core::encryption::encrypt(&auth_json)
        .map_err(|e| format!("Failed to encrypt auth: {}", e))?;
    
    // Update config
    if let Some(obj) = config.as_object_mut() {
        let key = format!("{}_proxy_auth_encrypted", proxy_type);
        obj.insert(key, serde_json::Value::String(encrypted));
        log::info!("Saved encrypted proxy auth for {} proxy", proxy_type);
    }
    
    // Write config back
    let config_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    
    Ok(())
}

/// Check if proxy auth is needed but not provided
/// If needed, show dialog and return the auth
pub async fn ensure_proxy_auth(
    app: &AppHandle,
    proxy_url: &str,
    existing_auth: Option<&chat_core::ProxyAuth>,
) -> Option<chat_core::ProxyAuth> {
    // If proxy URL is empty, no auth needed
    if proxy_url.is_empty() {
        return None;
    }
    
    // If auth already exists, use it
    if let Some(auth) = existing_auth {
        return Some(auth.clone());
    }
    
    // Otherwise, show dialog
    if let Some(input) = show_proxy_auth_dialog(app, proxy_url).await {
        Some(chat_core::ProxyAuth {
            username: input.username,
            password: input.password,
        })
    } else {
        None
    }
}