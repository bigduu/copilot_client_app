//! Context lifecycle operations - create, delete, and list

use super::ChatSessionManager;
use crate::error::AppError;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing;
use uuid::Uuid;

/// Create a new session with initial setup
pub(crate) async fn create_session<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
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

    // Inject available tools based on agent role
    manager.inject_tools(&mut ctx).await;

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

        manager.storage.save_context(&*ctx_lock).await?;
        ctx_lock.clear_dirty(); // Clear after successful save
    } // Write lock released here

    // Single cache lock operation
    let cache_size = {
        let mut cache = manager.cache.lock().await;
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

/// Delete a context from storage and cache
pub(crate) async fn delete_context<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
    id: Uuid,
) -> Result<(), AppError> {
    tracing::info!(
        context_id = %id,
        "SessionManager: Deleting context"
    );

    manager.storage.delete_context(id).await?;

    // Single cache lock operation
    let was_cached = {
        let mut cache = manager.cache.lock().await;
        cache.pop(&id).is_some()
    };

    tracing::debug!(
        context_id = %id,
        was_cached = was_cached,
        "SessionManager: Context deleted, removed from cache"
    );

    Ok(())
}

/// List all available contexts
pub(crate) async fn list_contexts<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
) -> Result<Vec<Uuid>, AppError> {
    tracing::debug!("SessionManager: Listing all contexts");
    let contexts = manager.storage.list_contexts().await?;
    tracing::debug!(
        context_count = contexts.len(),
        "SessionManager: Found contexts"
    );
    Ok(contexts)
}
