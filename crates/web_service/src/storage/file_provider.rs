use crate::error::Result;
use async_trait::async_trait;
use context_manager::structs::context::ChatContext;
use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

use super::provider::StorageProvider;

pub struct FileStorageProvider {
    base_dir: PathBuf,
}

impl FileStorageProvider {
    pub fn new(base_dir: impl AsRef<Path>) -> Self {
        Self {
            base_dir: base_dir.as_ref().to_path_buf(),
        }
    }

    fn get_path(&self, id: Uuid) -> PathBuf {
        self.base_dir.join(format!("{}.json", id))
    }
}

#[async_trait]
impl StorageProvider for FileStorageProvider {
    async fn load_context(&self, id: Uuid) -> Result<Option<ChatContext>> {
        let path = self.get_path(id);
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(path).await?;
        let context = serde_json::from_str(&content)?;
        Ok(Some(context))
    }

    async fn save_context(&self, context: &ChatContext) -> Result<()> {
        if !self.base_dir.exists() {
            fs::create_dir_all(&self.base_dir).await?;
        }
        let path = self.get_path(context.id);
        let content = serde_json::to_string_pretty(context)?;
        fs::write(path, content).await?;
        Ok(())
    }

    async fn list_contexts(&self) -> Result<Vec<Uuid>> {
        let mut contexts = Vec::new();
        if !self.base_dir.exists() {
            return Ok(contexts);
        }
        let mut entries = fs::read_dir(&self.base_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.is_file() {
                if let Some(stem) = path.file_stem() {
                    if let Some(stem_str) = stem.to_str() {
                        if let Ok(id) = Uuid::parse_str(stem_str) {
                            contexts.push(id);
                        }
                    }
                }
            }
        }
        Ok(contexts)
    }

    async fn delete_context(&self, id: Uuid) -> Result<()> {
        let path = self.get_path(id);
        if path.exists() {
            fs::remove_file(path).await?;
        }
        Ok(())
    }
}
