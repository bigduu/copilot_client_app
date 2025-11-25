//! Context persistence operations - load and save

use super::ChatSessionManager;
use crate::error::AppError;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing;
use uuid::Uuid;

/// Load a context from cache or storage
pub(crate) async fn load_context<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
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
        let cache = manager.cache.lock().await;
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
        // Re-inject tools for cached context (tools are not persisted)
        {
            let mut ctx = context.write().await;
            manager.inject_tools(&mut ctx).await;

            // Attach trace_id to cached context
            if let Some(tid) = trace_id {
                ctx.set_trace_id(tid);
            }
        }
        return Ok(Some(context));
    }

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %session_id,
        "SessionManager: Cache miss, loading from storage"
    );

    if let Some(mut context) = manager.storage.load_context(session_id).await? {
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

        // Inject available tools (tools are not persisted, need to be injected at runtime)
        manager.inject_tools(&mut context).await;

        let context = Arc::new(RwLock::new(context));

        // Single cache lock operation for inserting
        {
            let mut cache = manager.cache.lock().await;
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

/// Save a context to storage if dirty
pub(crate) async fn save_context<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
    context: &mut ChatContext,
) -> Result<(), AppError> {
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

    manager.storage.save_context(context).await?;
    context.clear_dirty();

    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context.id,
        "SessionManager: Context saved successfully"
    );

    Ok(())
}

/// Auto-save context only if dirty
pub(crate) async fn auto_save_if_dirty<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
    context: &Arc<RwLock<ChatContext>>,
) -> Result<(), AppError> {
    let mut context_lock = context.write().await;

    if !context_lock.is_dirty() {
        return Ok(());
    }

    save_context(manager, &mut context_lock).await?;
    Ok(())
}

/// Save system prompt snapshot for a context
pub(crate) async fn save_system_prompt_snapshot<T: StorageProvider>(
    manager: &ChatSessionManager<T>,
    context_id: Uuid,
    snapshot: &SystemPromptSnapshot,
) -> Result<(), AppError> {
    manager
        .storage
        .save_system_prompt_snapshot(context_id, snapshot)
        .await?;
    Ok(())
}
