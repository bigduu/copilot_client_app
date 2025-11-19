use crate::error::Result;
use async_trait::async_trait;
use context_manager::structs::context::ChatContext;
use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
use std::path::{Path, PathBuf};
use tokio::fs;
use tracing;
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

        tracing::debug!(
            context_id = %id,
            path = %path.display(),
            "FileStorage: load_context called"
        );

        if !path.exists() {
            tracing::debug!(
                context_id = %id,
                path = %path.display(),
                "FileStorage: File does not exist"
            );
            return Ok(None);
        }

        tracing::debug!(
            context_id = %id,
            path = %path.display(),
            "FileStorage: Reading file"
        );

        let content = fs::read_to_string(&path).await?;
        let file_size = content.len();

        tracing::debug!(
            context_id = %id,
            file_size = file_size,
            "FileStorage: Deserializing context"
        );

        let context: ChatContext = serde_json::from_str(&content)?;

        tracing::info!(
            context_id = %id,
            path = %path.display(),
            message_count = context.message_pool.len(),
            branch_count = context.branches.len(),
            "FileStorage: Context loaded successfully"
        );

        Ok(Some(context))
    }

    async fn save_context(&self, context: &ChatContext) -> Result<()> {
        let path = self.get_path(context.id);
        let trace_id = context.get_trace_id().map(|s| s.to_string());

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %context.id,
            path = %path.display(),
            "FileStorage: save_context called"
        );

        if !self.base_dir.exists() {
            tracing::debug!(
                path = %self.base_dir.display(),
                "FileStorage: Creating base directory"
            );
            fs::create_dir_all(&self.base_dir).await?;
        }

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %context.id,
            message_count = context.message_pool.len(),
            branch_count = context.branches.len(),
            "FileStorage: Serializing context"
        );

        let content = serde_json::to_string_pretty(context)?;
        let json_size = content.len();

        tracing::info!(
            trace_id = ?trace_id,
            context_id = %context.id,
            path = %path.display(),
            json_size = json_size,
            "FileStorage: Writing context file"
        );

        fs::write(&path, content).await?;

        tracing::info!(
            trace_id = ?trace_id,
            context_id = %context.id,
            path = %path.display(),
            "FileStorage: Context saved successfully"
        );

        Ok(())
    }

    async fn list_contexts(&self) -> Result<Vec<Uuid>> {
        tracing::debug!(
            base_dir = %self.base_dir.display(),
            "FileStorage: Scanning directory for contexts"
        );

        let mut contexts = Vec::new();
        if !self.base_dir.exists() {
            tracing::debug!(
                base_dir = %self.base_dir.display(),
                "FileStorage: Base directory does not exist"
            );
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

        tracing::info!(
            base_dir = %self.base_dir.display(),
            context_count = contexts.len(),
            "FileStorage: Contexts found"
        );

        Ok(contexts)
    }

    async fn delete_context(&self, id: Uuid) -> Result<()> {
        let path = self.get_path(id);

        tracing::info!(
            context_id = %id,
            path = %path.display(),
            "FileStorage: Deleting context"
        );

        if path.exists() {
            fs::remove_file(&path).await?;
            tracing::info!(
                context_id = %id,
                path = %path.display(),
                "FileStorage: Context file deleted"
            );
        } else {
            tracing::debug!(
                context_id = %id,
                path = %path.display(),
                "FileStorage: File did not exist"
            );
        }
        Ok(())
    }

    async fn save_system_prompt_snapshot(
        &self,
        _context_id: Uuid,
        _snapshot: &SystemPromptSnapshot,
    ) -> Result<()> {
        // FileStorageProvider is deprecated, stub implementation
        tracing::warn!("save_system_prompt_snapshot called on deprecated FileStorageProvider");
        Ok(())
    }

    async fn load_system_prompt_snapshot(
        &self,
        _context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>> {
        // FileStorageProvider is deprecated, stub implementation
        Ok(None)
    }
}
