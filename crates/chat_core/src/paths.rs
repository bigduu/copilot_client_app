use std::path::{Path, PathBuf};

/// Get Bodhi config directory (~/.bodhi)
pub fn bodhi_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join(".bodhi")
}

/// Get config.json path
pub fn config_json_path() -> PathBuf {
    bodhi_dir().join("config.json")
}

/// Get keyword_masking.json path
pub fn keyword_masking_json_path() -> PathBuf {
    bodhi_dir().join("keyword_masking.json")
}

/// Get workflows directory
pub fn workflows_dir() -> PathBuf {
    bodhi_dir().join("workflows")
}

/// Get anthropic-model-mapping.json path
pub fn anthropic_model_mapping_path() -> PathBuf {
    bodhi_dir().join("anthropic-model-mapping.json")
}

/// Ensure bodhi directory exists
pub fn ensure_bodhi_dir() -> std::io::Result<PathBuf> {
    let dir = bodhi_dir();
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Load JSON config file
pub fn load_config_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    if !path.exists() {
        return Err(format!("Config file not found: {}", path.display()));
    }
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read config: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {e}"))
}

/// Save JSON config file
pub fn save_config_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    std::fs::write(path, content).map_err(|e| format!("Failed to write config: {e}"))
}
