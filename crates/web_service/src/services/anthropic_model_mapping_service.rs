use crate::error::AppError;
use chat_core::paths::anthropic_model_mapping_path;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnthropicModelMapping {
    #[serde(default)]
    pub mappings: HashMap<String, String>,
}

pub async fn load_anthropic_model_mapping() -> Result<AnthropicModelMapping, AppError> {
    let path = anthropic_model_mapping_path();
    match fs::read(&path).await {
        Ok(content) => {
            let mapping = serde_json::from_slice::<AnthropicModelMapping>(&content)?;
            Ok(mapping)
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            // Return default mapping if file doesn't exist
            Ok(AnthropicModelMapping::default())
        }
        Err(err) => Err(AppError::StorageError(err)),
    }
}

pub async fn save_anthropic_model_mapping(
    mapping: AnthropicModelMapping,
) -> Result<AnthropicModelMapping, AppError> {
    let path = anthropic_model_mapping_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let data = serde_json::to_vec_pretty(&mapping)?;
    fs::write(path, data).await?;
    Ok(mapping)
}
