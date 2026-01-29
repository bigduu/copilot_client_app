use chat_core::keyword_masking::{KeywordEntry, KeywordMaskingConfig};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

const KEYWORD_MASKING_KEY: &str = "keyword_masking_config";

/// Response for keyword masking configuration
#[derive(Debug, Serialize, Deserialize)]
pub struct KeywordMaskingResponse {
    pub entries: Vec<KeywordEntry>,
}

/// Error response for validation failures
#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationError {
    pub index: usize,
    pub message: String,
}

fn open_settings_db(app_handle: &AppHandle) -> Result<rusqlite::Connection, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    if let Some(parent) = app_data_dir.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::create_dir_all(&app_data_dir);
    
    let db_path = app_data_dir.join("agents.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    
    let _ = conn.execute(
        "CREATE TRIGGER IF NOT EXISTS update_app_settings_timestamp 
         AFTER UPDATE ON app_settings 
         FOR EACH ROW
         BEGIN
             UPDATE app_settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
         END",
        [],
    );
    
    Ok(conn)
}

/// Get the global keyword masking configuration
#[tauri::command]
pub async fn get_keyword_masking_config(app: AppHandle) -> Result<KeywordMaskingResponse, String> {
    log::info!("Getting keyword masking configuration");
    
    let conn = open_settings_db(&app)?;
    
    let config_json: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [KEYWORD_MASKING_KEY],
            |row| row.get(0),
        )
        .ok();
    
    let config = match config_json {
        Some(json) => {
            serde_json::from_str(&json)
                .map_err(|e| format!("Failed to parse keyword masking config: {}", e))?
        }
        None => KeywordMaskingConfig::default(),
    };
    
    Ok(KeywordMaskingResponse {
        entries: config.entries,
    })
}

/// Update the global keyword masking configuration
#[tauri::command]
pub async fn update_keyword_masking_config(
    app: AppHandle,
    entries: Vec<KeywordEntry>,
) -> Result<KeywordMaskingResponse, String> {
    log::info!("Updating keyword masking configuration with {} entries", entries.len());
    
    // Validate all entries
    let config = KeywordMaskingConfig { entries };
    
    if let Err(errors) = config.validate() {
        let error_messages: Vec<String> = errors
            .into_iter()
            .map(|(idx, msg)| format!("Entry {}: {}", idx, msg))
            .collect();
        return Err(format!("Validation failed: {}", error_messages.join(", ")));
    }
    
    // Save to database
    let conn = open_settings_db(&app)?;
    let config_json = serde_json::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [KEYWORD_MASKING_KEY, &config_json],
    )
    .map_err(|e| format!("Failed to save config: {}", e))?;
    
    log::info!("Keyword masking configuration saved successfully");
    
    Ok(KeywordMaskingResponse {
        entries: config.entries,
    })
}

/// Validate keyword masking entries without saving
#[tauri::command]
pub async fn validate_keyword_entries(entries: Vec<KeywordEntry>) -> Result<(), Vec<ValidationError>> {
    let config = KeywordMaskingConfig { entries };
    
    match config.validate() {
        Ok(()) => Ok(()),
        Err(errors) => {
            let validation_errors: Vec<ValidationError> = errors
                .into_iter()
                .map(|(idx, msg)| ValidationError {
                    index: idx,
                    message: msg,
                })
                .collect();
            Err(validation_errors)
        }
    }
}
