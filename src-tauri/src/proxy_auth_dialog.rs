use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Proxy authentication info collected from dialog
#[derive(Debug, Clone)]
pub struct ProxyAuthInput {
    pub username: String,
    pub password: String,
}

/// Show proxy authentication dialog
/// Returns None if user cancels
pub async fn show_proxy_auth_dialog(
    app: &AppHandle,
    proxy_url: &str,
) -> Option<ProxyAuthInput> {
    // Show info dialog first
    let _ = app
        .dialog()
        .message(format!(
            "Proxy authentication required for:\n{}\n\nPlease enter your credentials.",
            proxy_url
        ))
        .title("Proxy Authentication Required")
        .ok_button_label("OK")
        .show(|_| {});

    // For now, return None - in a real implementation, you'd use a custom window
    // or stdin for headless mode
    // TODO: Implement custom dialog with username/password input fields
    
    // As a workaround, check environment variables
    if let Ok(username) = std::env::var("PROXY_USERNAME") {
        if let Ok(password) = std::env::var("PROXY_PASSWORD") {
            return Some(ProxyAuthInput {
                username,
                password,
            });
        }
    }
    
    None
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