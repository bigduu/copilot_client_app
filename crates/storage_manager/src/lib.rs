pub mod file_storage;

use async_trait::async_trait;

pub trait StorageContext: Send + Sized {
    fn get_id(&self) -> String;
    fn get_content(&self) -> String;
}

#[async_trait]
pub trait StorageManager: Send + Sized {
    type Content: StorageContext;
    async fn find(&self, content: Self::Content) -> anyhow::Result<Self::Content>;
    async fn save(&self, content: Self::Content) -> anyhow::Result<Self::Content>;
    async fn delete(&self, content: Self::Content) -> anyhow::Result<()>;
}
