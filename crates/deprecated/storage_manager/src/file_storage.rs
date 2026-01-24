use async_trait::async_trait;

use crate::{StorageContext, StorageManager};

pub struct FileContent {
    id: String,
    content: String,
}

impl StorageContext for FileContent {
    fn get_id(&self) -> String {
        return self.id.clone();
    }

    fn get_content(&self) -> String {
        return self.content.clone();
    }
}

pub struct FileStorage {}

#[async_trait]
impl StorageManager for FileStorage {
    type Content = FileContent;

    async fn find(&self, _content: Self::Content) -> anyhow::Result<Self::Content> {
        // TODO: Implement file finding logic
        todo!()
    }

    async fn save(&self, _content: Self::Content) -> anyhow::Result<Self::Content> {
        // TODO: Implement file saving logic
        todo!()
    }

    async fn delete(&self, _content: Self::Content) -> anyhow::Result<()> {
        // TODO: Implement file deletion logic
        todo!()
    }
}
