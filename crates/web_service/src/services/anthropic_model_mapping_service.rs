use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;

const MAPPING_FILE_NAME: &str = "anthropic-model-mapping.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnthropicModelMapping {
    #[serde(default)]
    pub mappings: HashMap<String, String>,
}

fn mapping_path() -> Result<PathBuf, AppError> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("HOME not set")))?;
    Ok(PathBuf::from(home).join(".bodhi").join(MAPPING_FILE_NAME))
}

pub async fn load_anthropic_model_mapping() -> Result<AnthropicModelMapping, AppError> {
    let path = mapping_path()?;
    match fs::read(&path).await {
        Ok(content) => {
            let mapping = serde_json::from_slice::<AnthropicModelMapping>(&content)?;
            Ok(mapping)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Ok(AnthropicModelMapping::default())
        }
        Err(err) => Err(AppError::StorageError(err)),
    }
}

pub async fn save_anthropic_model_mapping(
    mapping: AnthropicModelMapping,
) -> Result<AnthropicModelMapping, AppError> {
    let path = mapping_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let data = serde_json::to_vec_pretty(&mapping)?;
    fs::write(path, data).await?;
    Ok(mapping)
}
