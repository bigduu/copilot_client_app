use context_manager::structs::branch::SystemPrompt;
use serde_json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;

pub struct SystemPromptService {
    prompts: Arc<RwLock<HashMap<String, SystemPrompt>>>,
    storage_path: PathBuf,
}

impl SystemPromptService {
    pub fn new(storage_path: PathBuf) -> Self {
        Self {
            prompts: Arc::new(RwLock::new(HashMap::new())),
            storage_path,
        }
    }

    pub async fn load_from_storage(&self) -> Result<(), String> {
        let file_path = self.storage_path.join("system_prompts.json");
        
        if !file_path.exists() {
            return Ok(()); // No stored prompts yet
        }

        match fs::read_to_string(&file_path).await {
            Ok(content) => {
                match serde_json::from_str::<HashMap<String, SystemPrompt>>(&content) {
                    Ok(prompts) => {
                        *self.prompts.write().await = prompts;
                        Ok(())
                    }
                    Err(e) => Err(format!("Failed to parse system prompts: {}", e)),
                }
            }
            Err(e) => Err(format!("Failed to read system prompts file: {}", e)),
        }
    }

    pub async fn save_to_storage(&self) -> Result<(), String> {
        let file_path = self.storage_path.join("system_prompts.json");
        
        if !self.storage_path.exists() {
            if let Err(e) = fs::create_dir_all(&self.storage_path).await {
                return Err(format!("Failed to create storage directory: {}", e));
            }
        }

        let prompts = self.prompts.read().await;
        match serde_json::to_string_pretty(&*prompts) {
            Ok(content) => {
                fs::write(&file_path, content).await
                    .map_err(|e| format!("Failed to write system prompts file: {}", e))
            }
            Err(e) => Err(format!("Failed to serialize system prompts: {}", e)),
        }
    }

    pub async fn list_prompts(&self) -> Vec<SystemPrompt> {
        let prompts = self.prompts.read().await;
        prompts.values().cloned().collect()
    }

    pub async fn get_prompt(&self, id: &str) -> Option<SystemPrompt> {
        let prompts = self.prompts.read().await;
        prompts.get(id).cloned()
    }

    pub async fn create_prompt(&self, prompt: SystemPrompt) -> Result<(), String> {
        let mut prompts = self.prompts.write().await;
        prompts.insert(prompt.id.clone(), prompt.clone());
        drop(prompts); // Release lock before saving
        
        self.save_to_storage().await
    }

    pub async fn update_prompt(&self, id: &str, content: String) -> Result<(), String> {
        let mut prompts = self.prompts.write().await;
        
        if let Some(prompt) = prompts.get_mut(id) {
            prompt.content = content;
            drop(prompts); // Release lock before saving
            self.save_to_storage().await
        } else {
            Err(format!("System prompt '{}' not found", id))
        }
    }

    pub async fn delete_prompt(&self, id: &str) -> Result<(), String> {
        let mut prompts = self.prompts.write().await;
        
        if prompts.remove(id).is_some() {
            drop(prompts); // Release lock before saving
            self.save_to_storage().await
        } else {
            Err(format!("System prompt '{}' not found", id))
        }
    }
}

