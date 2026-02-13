use tauri::{AppHandle, Runtime};

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
///
/// Temporary behavior:
/// - read credentials from PROXY_USERNAME / PROXY_PASSWORD when available
/// - otherwise return Skip and let frontend SetupPage handle interactive input
pub async fn show_proxy_auth_dialog<R: Runtime>(
    _app: &AppHandle<R>,
    proxy_url: &str,
) -> DialogResult {
    if let Ok(username) = std::env::var("PROXY_USERNAME") {
        if let Ok(password) = std::env::var("PROXY_PASSWORD") {
            log::info!("Using proxy auth from environment variables");
            return DialogResult::Auth(ProxyAuthInput {
                username,
                password,
                remember: false,
            });
        }
    }

    if proxy_url.is_empty() {
        log::info!(
            "Proxy auth requested, but interactive proxy auth dialog is disabled. Returning Skip."
        );
    } else {
        log::info!(
            "Proxy auth may be required for {}, but interactive proxy auth dialog is disabled. Returning Skip.",
            proxy_url
        );
    }

    DialogResult::Skip
}

/// Save proxy auth to config file (encrypted)
pub fn save_proxy_auth_to_config(proxy_type: &str, auth: &ProxyAuthInput) -> Result<(), String> {
    if !auth.remember {
        log::info!("Not saving proxy auth (remember=false)");
        return Ok(());
    }

    use crate::app_settings::config_json_path;
    use chat_core::ProxyAuth;

    let config_path = config_json_path();

    let mut config: serde_json::Value = if config_path.exists() {
        std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let proxy_auth = ProxyAuth {
        username: auth.username.clone(),
        password: auth.password.clone(),
    };

    let auth_json = serde_json::to_string(&proxy_auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;

    let encrypted = chat_core::encryption::encrypt(&auth_json)
        .map_err(|e| format!("Failed to encrypt auth: {}", e))?;

    if let Some(obj) = config.as_object_mut() {
        let key = format!("{}_proxy_auth_encrypted", proxy_type);
        obj.insert(key, serde_json::Value::String(encrypted));
        log::info!("Saved encrypted proxy auth for {} proxy", proxy_type);
    }

    let config_str = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&config_path, config_str)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/// Check if proxy auth is needed but not provided
/// If needed, show dialog and return the auth
pub async fn ensure_proxy_auth<R: Runtime>(
    app: &AppHandle<R>,
    proxy_url: &str,
    existing_auth: Option<&chat_core::ProxyAuth>,
) -> Option<chat_core::ProxyAuth> {
    if proxy_url.is_empty() {
        return None;
    }

    if let Some(auth) = existing_auth {
        return Some(auth.clone());
    }

    match show_proxy_auth_dialog(app, proxy_url).await {
        DialogResult::Auth(input) => Some(chat_core::ProxyAuth {
            username: input.username,
            password: input.password,
        }),
        DialogResult::Skip | DialogResult::Cancel => None,
    }
}
