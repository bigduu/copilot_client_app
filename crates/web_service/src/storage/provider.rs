use crate::error::Result;
use async_trait::async_trait;
use context_manager::structs::context::ChatContext;
use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
use uuid::Uuid;

#[async_trait]
pub trait StorageProvider: Send + Sync {
    async fn load_context(&self, id: Uuid) -> Result<Option<ChatContext>>;
    async fn save_context(&self, context: &ChatContext) -> Result<()>;
    async fn list_contexts(&self) -> Result<Vec<Uuid>>;
    async fn delete_context(&self, id: Uuid) -> Result<()>;

    /// Save system prompt snapshot for debugging and tracing
    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<()>;

    /// Load the latest system prompt snapshot
    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>>;
}
