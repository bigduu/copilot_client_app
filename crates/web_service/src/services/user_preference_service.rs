use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::{fs, sync::RwLock};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserPreferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_opened_chat_id: Option<Uuid>,
    #[serde(default = "default_auto_generate_titles")]
    pub auto_generate_titles: bool,
}

const fn default_auto_generate_titles() -> bool {
    true
}

#[derive(Debug, Default)]
pub struct UserPreferenceUpdate {
    pub last_opened_chat_id: Option<Option<Uuid>>,
    pub auto_generate_titles: Option<bool>,
}

pub struct UserPreferenceService {
    storage_path: PathBuf,
    preferences: RwLock<UserPreferences>,
}

impl UserPreferenceService {
    pub fn new(base_dir: PathBuf) -> Self {
        let storage_path = base_dir.join("user_preferences.json");
        Self {
            storage_path,
            preferences: RwLock::new(UserPreferences::default()),
        }
    }

    pub async fn load_from_storage(&self) -> Result<(), AppError> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        match fs::read(&self.storage_path).await {
            Ok(content) => {
                let prefs: UserPreferences = serde_json::from_slice(&content)?;
                let mut guard = self.preferences.write().await;
                *guard = prefs;
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                self.persist(UserPreferences::default()).await?;
            }
            Err(err) => return Err(AppError::StorageError(err)),
        }

        Ok(())
    }

    pub async fn get_preferences(&self) -> Result<UserPreferences, AppError> {
        let guard = self.preferences.read().await;
        Ok(guard.clone())
    }

    pub async fn update_preferences(
        &self,
        update: UserPreferenceUpdate,
    ) -> Result<UserPreferences, AppError> {
        let mut guard = self.preferences.write().await;

        if let Some(last_opened_chat_id) = update.last_opened_chat_id {
            guard.last_opened_chat_id = last_opened_chat_id;
        }
        if let Some(auto_generate_titles) = update.auto_generate_titles {
            guard.auto_generate_titles = auto_generate_titles;
        }

        self.persist(guard.clone()).await?;
        Ok(guard.clone())
    }

    async fn persist(&self, prefs: UserPreferences) -> Result<(), AppError> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let json = serde_json::to_vec_pretty(&prefs)?;
        fs::write(&self.storage_path, json).await?;
        Ok(())
    }
}
