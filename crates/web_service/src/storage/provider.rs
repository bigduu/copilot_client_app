use crate::error::Result;
use async_trait::async_trait;
use context_manager::structs::context::ChatContext;
use uuid::Uuid;

#[async_trait]
pub trait StorageProvider: Send + Sync {
    async fn load_context(&self, id: Uuid) -> Result<Option<ChatContext>>;
    async fn save_context(&self, context: &ChatContext) -> Result<()>;
    async fn list_contexts(&self) -> Result<Vec<Uuid>>;
    async fn delete_context(&self, id: Uuid) -> Result<()>;
}
