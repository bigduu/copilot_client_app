use crate::error::AppError;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing;
use uuid::Uuid;

/// Manages chat contexts with LRU caching and persistence.
///
/// Lock Ordering Rules (to prevent deadlocks):
/// 1. Always acquire cache lock before context lock
/// 2. Release cache lock before acquiring context lock when possible
/// 3. Keep lock scopes minimal
pub struct ChatSessionManager<T: StorageProvider> {
    storage: Arc<T>,
    /// LRU cache of active contexts. Each context is protected by RwLock for concurrent reads.
    cache: Mutex<LruCache<Uuid, Arc<RwLock<ChatContext>>>>,
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
        trace_id: Option<String>,
    ) -> Result<Arc<RwLock<ChatContext>>, AppError> {
        tracing::info!(
            trace_id = ?trace_id,
            model_id = %model_id,
            mode = %mode,
            "SessionManager: Creating new session"
        );

        let id = Uuid::new_v4();
        let mut ctx = ChatContext::new(id, model_id.clone(), mode.clone());
        if let Some(tid) = trace_id.clone() {
            ctx.set_trace_id(tid);
        }
        let context = Arc::new(RwLock::new(ctx));

        {
            // Acquire write lock for initial save
            let mut ctx_lock = context.write().await;
            ctx_lock.mark_dirty(); // Mark as dirty for initial save

            tracing::debug!(
                trace_id = ?trace_id,
                context_id = %id,
                "SessionManager: Saving new session to storage"
            );

            self.storage.save_context(&*ctx_lock).await?;
            ctx_lock.clear_dirty(); // Clear after successful save
        } // Write lock released here

        // Single cache lock operation
        let cache_size = {
            let mut cache = self.cache.lock().await;
            let size = cache.len();
            cache.put(id, context.clone());
            size
        };

        tracing::info!(
            trace_id = ?trace_id,
            context_id = %id,
            cache_size = cache_size + 1,
            "SessionManager: Session created and cached"
        );

        Ok(context)
    }

    pub async fn load_context(
        &self,
        session_id: Uuid,
        trace_id: Option<String>,
    ) -> Result<Option<Arc<RwLock<ChatContext>>>, AppError> {
        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %session_id,
            "SessionManager: Loading context"
        );

        // Single cache lock operation for checking
        let cached_context = {
            let cache = self.cache.lock().await;
            let size = cache.len();
            if let Some(context) = cache.peek(&session_id) {
                tracing::debug!(
                    trace_id = ?trace_id,
                    context_id = %session_id,
                    cache_size = size,
                    "SessionManager: Cache hit"
                );
                Some(context.clone())
            } else {
                None
            }
        }; // Cache lock released here

        if let Some(context) = cached_context {
            // Attach trace_id to cached context (requires write lock)
            if let Some(tid) = trace_id {
                context.write().await.set_trace_id(tid);
            }
            return Ok(Some(context));
        }

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %session_id,
            "SessionManager: Cache miss, loading from storage"
        );

        if let Some(mut context) = self.storage.load_context(session_id).await? {
            tracing::info!(
                trace_id = ?trace_id,
                context_id = %session_id,
                message_count = context.message_pool.len(),
                branch_count = context.branches.len(),
                "SessionManager: Context loaded from storage"
            );

            // Attach trace_id to loaded context
            if let Some(tid) = trace_id.clone() {
                context.set_trace_id(tid);
            }
            let context = Arc::new(RwLock::new(context));

            // Single cache lock operation for inserting
            {
                let mut cache = self.cache.lock().await;
                cache.put(session_id, context.clone());
            }

            tracing::debug!(
                trace_id = ?trace_id,
                context_id = %session_id,
                "SessionManager: Context added to cache"
            );

            return Ok(Some(context));
        }

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %session_id,
            "SessionManager: Context not found"
        );

        Ok(None)
    }

    pub async fn save_context(&self, context: &mut ChatContext) -> Result<(), AppError> {
        let trace_id = context.get_trace_id().map(|s| s.to_string());

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %context.id,
            dirty = context.is_dirty(),
            "SessionManager: save_context called"
        );

        if !context.is_dirty() {
            tracing::debug!(
                trace_id = ?trace_id,
                context_id = %context.id,
                "SessionManager: Context not dirty, skipping save"
            );
            return Ok(());
        }

        tracing::info!(
            trace_id = ?trace_id,
            context_id = %context.id,
            message_count = context.message_pool.len(),
            branch_count = context.branches.len(),
            "SessionManager: Saving dirty context"
        );

        self.storage.save_context(context).await?;
        context.clear_dirty();

        tracing::info!(
            trace_id = ?trace_id,
            context_id = %context.id,
            "SessionManager: Context saved successfully"
        );

        Ok(())
    }

    pub async fn list_contexts(&self) -> Result<Vec<Uuid>, AppError> {
        tracing::debug!("SessionManager: Listing all contexts");
        let contexts = self.storage.list_contexts().await?;
        tracing::debug!(
            context_count = contexts.len(),
            "SessionManager: Found contexts"
        );
        Ok(contexts)
    }

    pub async fn delete_context(&self, id: Uuid) -> Result<(), AppError> {
        tracing::info!(
            context_id = %id,
            "SessionManager: Deleting context"
        );

        self.storage.delete_context(id).await?;

        // Single cache lock operation
        let was_cached = {
            let mut cache = self.cache.lock().await;
            cache.pop(&id).is_some()
        };

        tracing::debug!(
            context_id = %id,
            was_cached = was_cached,
            "SessionManager: Context deleted, removed from cache"
        );

        Ok(())
    }
}
