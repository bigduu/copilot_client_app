use log::info;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

const SPOTLIGHT_WINDOW_LABEL: &str = "spotlight";

pub fn get_spotlight_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space)
}

/// Handle global shortcut event
pub fn handle_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutState) {
    let spotlight_shortcut = get_spotlight_shortcut();
    if *shortcut == spotlight_shortcut && event == ShortcutState::Pressed {
        info!("Spotlight shortcut triggered!");
        toggle_spotlight(app);
    }
}

/// Toggle spotlight window visibility
fn toggle_spotlight<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(SPOTLIGHT_WINDOW_LABEL) {
        // Window exists, toggle visibility
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = show_spotlight(app);
        }
    } else {
        // Create new window
        let _ = create_spotlight_window(app);
    }
}

/// Create spotlight window
fn create_spotlight_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    info!("Creating spotlight window...");

    let window = tauri::WebviewWindowBuilder::new(
        app,
        SPOTLIGHT_WINDOW_LABEL,
        tauri::WebviewUrl::App("/spotlight".into()),
    )
    .title("Bodhi Spotlight")
    .inner_size(600.0, 80.0)
    .decorations(false)
    .always_on_top(true)
    .center()
    .skip_taskbar(true)
    .build()
    .map_err(|e| format!("Failed to create spotlight window: {}", e))?;

    // Focus input when shown
    let _ = window.set_focus();

    info!("Spotlight window created");
    Ok(())
}

/// Show spotlight window
pub fn show_spotlight<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SPOTLIGHT_WINDOW_LABEL) {
        window
            .center()
            .map_err(|e| format!("Failed to center window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
    } else {
        create_spotlight_window(app)?;
    }
    Ok(())
}

/// Hide spotlight window
pub fn hide_spotlight<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SPOTLIGHT_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|e| format!("Failed to hide window: {}", e))?;
    }
    Ok(())
}

/// Send message from spotlight to main window
#[tauri::command]
pub fn send_spotlight_message(app: AppHandle, message: String) -> Result<(), String> {
    info!("Sending spotlight message: {}", message);

    // Hide spotlight window
    hide_spotlight(&app)?;

    // Show main window
    if let Some(main_window) = app.get_webview_window("main") {
        main_window
            .show()
            .map_err(|e| format!("Failed to show main window: {}", e))?;
        main_window
            .set_focus()
            .map_err(|e| format!("Failed to focus main window: {}", e))?;

        // Emit event to frontend
        app.emit("new-chat-message", json!({ "message": message }))
            .map_err(|e| format!("Failed to emit event: {}", e))?;

        info!("Event emitted to main window");
    }

    Ok(())
}

/// Close spotlight window
#[tauri::command]
pub fn close_spotlight(app: AppHandle) -> Result<(), String> {
    hide_spotlight(&app)
}
