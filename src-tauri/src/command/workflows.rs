use crate::bodhi_settings::bodhi_dir;
use std::fs;
use std::path::PathBuf;

fn workflows_dir() -> PathBuf {
    bodhi_dir().join("workflows")
}

fn is_safe_workflow_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return false;
    }
    true
}

#[tauri::command]
pub async fn save_workflow(name: String, content: String) -> Result<String, String> {
    if !is_safe_workflow_name(&name) {
        return Err("Invalid workflow name".to_string());
    }

    let dir = workflows_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create workflows dir: {e}"))?;

    let file_path = dir.join(format!("{name}.md"));
    fs::write(&file_path, content).map_err(|e| format!("Failed to save workflow: {e}"))?;

    Ok(file_path.to_string_lossy().to_string())
}
