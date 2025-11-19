use rfd::AsyncFileDialog;

/// Opens a native folder selection dialog for Tauri desktop clients.
///
/// This Tauri command provides native file dialog functionality for desktop clients
/// where GUI context and main thread access are available.
///
/// **Architecture Note**:
/// - Tauri clients use this command for native dialogs (has GUI context)
/// - Web clients use HTTP API `/v1/workspace/pick-folder` for path suggestions
/// - Backend (`web_service`) cannot open native dialogs (headless HTTP server)
///
/// This hybrid approach provides the best UX for each client type while respecting
/// technical limitations.
#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    let file_dialog = AsyncFileDialog::new()
        .set_title("选择工作区文件夹")
        .set_can_create_directories(true);

    let folder_path = file_dialog.pick_folder().await;

    match folder_path {
        Some(path) => {
            let path_str = path.path().display().to_string();
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}
