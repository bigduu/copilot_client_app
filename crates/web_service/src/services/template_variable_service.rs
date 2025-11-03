//! Template Variable Service
//!
//! Manages template variables for system prompts, allowing users to customize
//! prompt behavior (language, response format, etc.) without modifying base prompts.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

/// Template variable configuration
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TemplateVariable {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
}

/// Default template variables
fn get_default_template_variables() -> HashMap<String, String> {
    let mut vars = HashMap::new();
    vars.insert("preferred_language".to_string(), "English".to_string());
    vars.insert("response_format".to_string(), "professional".to_string());
    vars.insert("tone".to_string(), "friendly".to_string());
    vars.insert("detail_level".to_string(), "moderate".to_string());
    vars
}

/// Service for managing template variables
pub struct TemplateVariableService {
    variables: Arc<RwLock<HashMap<String, String>>>,
    storage_path: PathBuf,
}

impl TemplateVariableService {
    pub fn new(storage_path: PathBuf) -> Self {
        Self {
            variables: Arc::new(RwLock::new(HashMap::new())),
            storage_path,
        }
    }

    /// Load template variables from storage
    pub async fn load_from_storage(&self) -> Result<(), String> {
        let file_path = self.storage_path.join("template_variables.json");

        // If file doesn't exist, initialize with default variables
        if !file_path.exists() {
            let mut variables = self.variables.write().await;
            *variables = get_default_template_variables();
            drop(variables);
            return self.save_to_storage().await;
        }

        match fs::read_to_string(&file_path).await {
            Ok(content) => {
                match serde_json::from_str::<HashMap<String, String>>(&content) {
                    Ok(vars) => {
                        let mut variables = self.variables.write().await;
                        // Merge with defaults: defaults only if key doesn't exist
                        let defaults = get_default_template_variables();
                        for (key, value) in defaults {
                            if !vars.contains_key(&key) {
                                variables.insert(key, value);
                            }
                        }
                        // Add user-defined variables
                        for (key, value) in vars {
                            variables.insert(key, value);
                        }
                        Ok(())
                    }
                    Err(e) => Err(format!("Failed to parse template variables: {}", e)),
                }
            }
            Err(e) => Err(format!("Failed to read template variables file: {}", e)),
        }
    }

    /// Save template variables to storage
    pub async fn save_to_storage(&self) -> Result<(), String> {
        let file_path = self.storage_path.join("template_variables.json");

        if !self.storage_path.exists() {
            if let Err(e) = fs::create_dir_all(&self.storage_path).await {
                return Err(format!("Failed to create storage directory: {}", e));
            }
        }

        let variables = self.variables.read().await;
        match serde_json::to_string_pretty(&*variables) {
            Ok(content) => {
                fs::write(&file_path, content)
                    .await
                    .map_err(|e| format!("Failed to write template variables file: {}", e))
            }
            Err(e) => Err(format!("Failed to serialize template variables: {}", e)),
        }
    }

    /// Get all template variables
    pub async fn get_all(&self) -> HashMap<String, String> {
        let variables = self.variables.read().await;
        variables.clone()
    }

    /// Get a specific template variable
    pub async fn get(&self, key: &str) -> Option<String> {
        let variables = self.variables.read().await;
        variables.get(key).cloned()
    }

    /// Set a template variable
    pub async fn set(&self, key: String, value: String) -> Result<(), String> {
        let mut variables = self.variables.write().await;
        variables.insert(key, value);
        drop(variables);
        self.save_to_storage().await
    }

    /// Set multiple template variables at once
    pub async fn set_multiple(&self, vars: HashMap<String, String>) -> Result<(), String> {
        let mut variables = self.variables.write().await;
        for (key, value) in vars {
            variables.insert(key, value);
        }
        drop(variables);
        self.save_to_storage().await
    }

    /// Delete a template variable
    pub async fn delete(&self, key: &str) -> Result<(), String> {
        let mut variables = self.variables.write().await;
        if variables.remove(key).is_some() {
            drop(variables);
            self.save_to_storage().await
        } else {
            Err(format!("Template variable '{}' not found", key))
        }
    }

    /// Reload from storage (useful for real-time updates)
    pub async fn reload(&self) -> Result<(), String> {
        self.load_from_storage().await
    }
}

