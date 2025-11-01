use crate::error::AppError;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use log::debug;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

pub struct ChatSessionManager<T: StorageProvider> {
    storage: Arc<T>,
    cache: Mutex<LruCache<Uuid, Arc<Mutex<ChatContext>>>>,
}

impl<T: StorageProvider> ChatSessionManager<T> {
    pub fn new(storage: Arc<T>, cache_size: usize) -> Self {
        Self {
            storage,
            cache: Mutex::new(LruCache::new(NonZeroUsize::new(cache_size).unwrap())),
        }
    }

    pub async fn create_session(
        &self,
        model_id: String,
        mode: String,
    ) -> Result<Arc<Mutex<ChatContext>>, AppError> {
        let id = Uuid::new_v4();
        let context = Arc::new(Mutex::new(ChatContext::new(id, model_id, mode)));
        let mut ctx_lock = context.lock().await;
        ctx_lock.mark_dirty(); // Mark as dirty for initial save
        self.storage
            .save_context(&*ctx_lock)
            .await?;
        ctx_lock.clear_dirty(); // Clear after successful save
        drop(ctx_lock);
        self.cache.lock().await.put(id, context.clone());
        Ok(context)
    }

    pub async fn load_context(
        &self,
        session_id: Uuid,
    ) -> Result<Option<Arc<Mutex<ChatContext>>>, AppError> {
        if let Some(context) = self.cache.lock().await.get(&session_id) {
            return Ok(Some(context.clone()));
        }

        if let Some(context) = self.storage.load_context(session_id).await? {
            let context = Arc::new(Mutex::new(context));
            self.cache.lock().await.put(session_id, context.clone());
            return Ok(Some(context));
        }

        Ok(None)
    }
    
    pub async fn save_context(&self, context: &mut ChatContext) -> Result<(), AppError> {
        if !context.is_dirty() {
            debug!("Context {} is not dirty, skipping save", context.id);
            return Ok(());
        }
        
        debug!("Saving dirty context {}", context.id);
        self.storage.save_context(context).await?;
        context.clear_dirty();
        Ok(())
    }
    
    pub async fn list_contexts(&self) -> Result<Vec<Uuid>, AppError> {
        self.storage.list_contexts().await
    }
    
    pub async fn delete_context(&self, id: Uuid) -> Result<(), AppError> {
        self.storage.delete_context(id).await?;
        self.cache.lock().await.pop(&id);
        Ok(())
    }
}
