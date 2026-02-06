use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Proxy authentication info collected from dialog
#[derive(Debug, Clone)]
pub struct ProxyAuthInput {
    pub username: String,
    pub password: String,
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
            // TODO: Open custom window for username/password input
            // For now, return Cancel - user needs to set env vars
            log::info!("User chose to configure proxy auth");
            DialogResult::Cancel
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