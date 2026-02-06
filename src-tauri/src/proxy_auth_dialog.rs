use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Listener, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

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

#[derive(Debug, Deserialize)]
struct ProxyAuthFormSubmitPayload {
    username: String,
    password: String,
    #[serde(default)]
    remember: bool,
}

fn send_dialog_result(
    sender: &Arc<Mutex<Option<tokio::sync::oneshot::Sender<DialogResult>>>>,
    result: DialogResult,
) {
    if let Ok(mut guard) = sender.lock() {
        if let Some(tx) = guard.take() {
            let _ = tx.send(result);
        }
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn build_proxy_auth_dialog_script(
    proxy_url: &str,
    submit_event: &str,
    cancel_event: &str,
) -> String {
    let proxy_url_safe = escape_html(proxy_url);
    let html = format!(
        r#"
<style>
  :root {{ color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }}
  body {{ margin: 0; background: #1f1f1f; color: #f5f5f5; }}
  .dialog {{ padding: 20px; display: flex; flex-direction: column; gap: 14px; }}
  h2 {{ margin: 0; font-size: 18px; }}
  p {{ margin: 0; color: #d9d9d9; font-size: 13px; line-height: 1.4; }}
  .proxy-url {{ word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }}
  form {{ display: flex; flex-direction: column; gap: 12px; }}
  label {{ display: flex; flex-direction: column; gap: 6px; font-size: 13px; }}
  input[type='text'], input[type='password'] {{
    border: 1px solid #434343;
    border-radius: 6px;
    background: #141414;
    color: #fff;
    padding: 8px 10px;
    font-size: 13px;
  }}
  .remember-row {{ flex-direction: row; align-items: center; gap: 8px; user-select: none; }}
  .buttons {{ display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }}
  button {{
    border: 1px solid #595959;
    border-radius: 6px;
    background: #262626;
    color: #f5f5f5;
    padding: 6px 16px;
    font-size: 13px;
    cursor: pointer;
  }}
  button[type='submit'] {{ background: #1677ff; border-color: #1677ff; color: #fff; }}
  button:hover {{ filter: brightness(1.05); }}
</style>
<div class='dialog'>
  <h2>Proxy Authentication</h2>
  <p>Enter credentials for proxy:</p>
  <p class='proxy-url'>{}</p>
  <form id='proxy-auth-form'>
    <label>
      Username
      <input id='proxy-username' type='text' autocomplete='username' required />
    </label>
    <label>
      Password
      <input id='proxy-password' type='password' autocomplete='current-password' required />
    </label>
    <label class='remember-row'>
      <input id='proxy-remember' type='checkbox' />
      <span>Remember me</span>
    </label>
    <div class='buttons'>
      <button id='proxy-cancel' type='button'>Cancel</button>
      <button type='submit'>OK</button>
    </div>
  </form>
</div>
"#,
        proxy_url_safe
    );

    let html_json = serde_json::to_string(&html).unwrap_or_else(|_| "\"\"".to_string());
    let submit_event_json =
        serde_json::to_string(submit_event).unwrap_or_else(|_| "\"\"".to_string());
    let cancel_event_json =
        serde_json::to_string(cancel_event).unwrap_or_else(|_| "\"\"".to_string());

    format!(
        r#"
window.addEventListener('DOMContentLoaded', () => {{
  document.title = 'Proxy Authentication';
  document.body.innerHTML = {html_json};

  const emit = (eventName, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {{ event: eventName, payload }});

  const submitEvent = {submit_event_json};
  const cancelEvent = {cancel_event_json};

  const form = document.getElementById('proxy-auth-form');
  const username = document.getElementById('proxy-username');
  const password = document.getElementById('proxy-password');
  const remember = document.getElementById('proxy-remember');
  const cancel = document.getElementById('proxy-cancel');

  form.addEventListener('submit', async (event) => {{
    event.preventDefault();
    await emit(submitEvent, {{
      username: username.value || '',
      password: password.value || '',
      remember: Boolean(remember.checked)
    }});
  }});

  cancel.addEventListener('click', async () => {{
    await emit(cancelEvent, null);
  }});

  window.addEventListener('keydown', async (event) => {{
    if (event.key === 'Escape') {{
      await emit(cancelEvent, null);
    }}
  }});

  username.focus();
}});
"#
    )
}

/// Show proxy authentication dialog
/// Returns None if user cancels or skips
pub async fn show_proxy_auth_dialog<R: Runtime>(app: &AppHandle<R>, proxy_url: &str) -> DialogResult {
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
            log::info!("User chose to configure proxy auth");
            show_proxy_auth_input_dialog(app, proxy_url).await
        }
        Ok(false) => {
            log::info!("User skipped proxy auth configuration");
            DialogResult::Skip
        }
        Err(_) => {
            log::warn!("Proxy auth dialog failed");
            DialogResult::Cancel
        }
    }
}

/// Show proxy auth input dialog (username/password)
async fn show_proxy_auth_input_dialog<R: Runtime>(app: &AppHandle<R>, proxy_url: &str) -> DialogResult {
    let dialog_id = Uuid::new_v4().to_string();
    let window_label = format!("proxy-auth-dialog-{}", dialog_id);
    let submit_event = format!("proxy-auth-dialog-submit-{}", dialog_id);
    let cancel_event = format!("proxy-auth-dialog-cancel-{}", dialog_id);

    let script = build_proxy_auth_dialog_script(proxy_url, &submit_event, &cancel_event);

    let window = match WebviewWindowBuilder::new(
        app,
        window_label.clone(),
        WebviewUrl::App("index.html".into()),
    )
    .title("Proxy Authentication")
    .inner_size(420.0, 340.0)
    .resizable(false)
    .center()
    .initialization_script(script)
    .build()
    {
        Ok(window) => window,
        Err(error) => {
            log::error!("Failed to create proxy auth input window: {}", error);
            return DialogResult::Cancel;
        }
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(tx)));

    let sender_for_submit = Arc::clone(&sender);
    let app_for_submit = app.clone();
    let window_label_for_submit = window_label.clone();
    let submit_listener = app.listen(submit_event.clone(), move |event| {
        let payload = match serde_json::from_str::<ProxyAuthFormSubmitPayload>(event.payload()) {
            Ok(payload) => payload,
            Err(error) => {
                log::error!("Invalid proxy auth payload: {}", error);
                send_dialog_result(&sender_for_submit, DialogResult::Cancel);
                if let Some(window) = app_for_submit.get_webview_window(&window_label_for_submit) {
                    let _ = window.close();
                }
                return;
            }
        };

        send_dialog_result(
            &sender_for_submit,
            DialogResult::Auth(ProxyAuthInput {
                username: payload.username,
                password: payload.password,
                remember: payload.remember,
            }),
        );

        if let Some(window) = app_for_submit.get_webview_window(&window_label_for_submit) {
            let _ = window.close();
        }
    });

    let sender_for_cancel = Arc::clone(&sender);
    let app_for_cancel = app.clone();
    let window_label_for_cancel = window_label.clone();
    let cancel_listener = app.listen(cancel_event.clone(), move |_| {
        send_dialog_result(&sender_for_cancel, DialogResult::Cancel);
        if let Some(window) = app_for_cancel.get_webview_window(&window_label_for_cancel) {
            let _ = window.close();
        }
    });

    let sender_for_close = Arc::clone(&sender);
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
        ) {
            send_dialog_result(&sender_for_close, DialogResult::Cancel);
        }
    });

    let result = match rx.await {
        Ok(result) => result,
        Err(_) => DialogResult::Cancel,
    };

    app.unlisten(submit_listener);
    app.unlisten(cancel_listener);

    if let Some(window) = app.get_webview_window(&window_label) {
        let _ = window.close();
    }

    result
}

/// Save proxy auth to config file (encrypted)
pub fn save_proxy_auth_to_config(proxy_type: &str, auth: &ProxyAuthInput) -> Result<(), String> {
    if !auth.remember {
        log::info!("Not saving proxy auth (remember=false)");
        return Ok(());
    }

    use crate::bodhi_settings::config_json_path;
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
