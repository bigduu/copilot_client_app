use std::path::Path;

pub fn load_config_json(path: &Path) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config.json: {e}"))
}

pub fn write_config_json(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn update_claude_config(
    path: &Path,
    binary_path: Option<String>,
    installation_preference: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut root = load_config_json(path)?;
    let root_obj = root
        .as_object_mut()
        .ok_or("config.json must be a JSON object")?;
    let claude_entry = root_obj.entry("claude").or_insert_with(|| serde_json::json!({}));
    let claude_obj = claude_entry
        .as_object_mut()
        .ok_or("claude must be a JSON object")?;

    if let Some(path) = binary_path {
        claude_obj.insert("binary_path".to_string(), serde_json::Value::String(path));
    }
    if let Some(pref) = installation_preference {
        claude_obj.insert(
            "installation_preference".to_string(),
            serde_json::Value::String(pref),
        );
    }

    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_claude_settings_without_clobbering() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, r#"{\"api_base\":\"https://example.com\"}"#).unwrap();

        let updated = update_claude_config(
            &path,
            Some("/bin/claude".to_string()),
            Some("system".to_string()),
        )
        .unwrap();
        let api_base = updated.get("api_base").and_then(|v| v.as_str()).unwrap();
        let claude = updated.get("claude").unwrap();

        assert_eq!(api_base, "https://example.com");
        assert_eq!(
            claude.get("binary_path").and_then(|v| v.as_str()).unwrap(),
            "/bin/claude"
        );
        assert_eq!(
            claude
                .get("installation_preference")
                .and_then(|v| v.as_str())
                .unwrap(),
            "system"
        );
    }
}
