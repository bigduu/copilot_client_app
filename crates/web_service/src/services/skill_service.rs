use crate::error::AppError;
use std::path::PathBuf;
use tokio::fs;

const WORKFLOWS_DIR: &str = ".bodhi/workflows";

/// List available workflows from the workflows directory
pub async fn list_workflows() -> Result<Vec<String>, AppError> {
    let home = dirs::home_dir()
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("HOME not set")))?;

    let workflows_dir = home.join(WORKFLOWS_DIR);

    if !workflows_dir.exists() {
        return Ok(Vec::new());
    }

    let mut workflows = Vec::new();
    let mut entries = fs::read_dir(&workflows_dir).await.map_err(|e| {
        AppError::InternalError(anyhow::anyhow!("Failed to read workflows dir: {}", e))
    })?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("Failed to read entry: {}", e)))?
    {
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
