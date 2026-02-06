use crate::error::AppError;
use chat_core::paths::workflows_dir;
use tokio::fs;

/// List available workflows from the workflows directory
pub async fn list_workflows() -> Result<Vec<String>, AppError> {
    let workflows_dir = workflows_dir();

    if !workflows_dir.exists() {
        return Ok(Vec::new());
    }

    let mut workflows = Vec::new();
    let mut entries = fs::read_dir(&workflows_dir).await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to read workflows dir: {}", e)))?;

    while let Some(entry) = entries.next_entry().await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to read entry: {}", e)))? {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_stem() {
                workflows.push(name.to_string_lossy().to_string());
            }
        }
    }

    workflows.sort();
    Ok(workflows)
}
