//! Session management service
//!
//! Manages chat contexts with LRU caching and persistence:
//! - Context lifecycle (create, delete, list)
//! - Context persistence (load, save)
//! - Tool injection based on agent role
//! - LRU cache for active contexts

mod converters;
mod lifecycle;
mod persistence;

use crate::error::AppError;
use crate::storage::provider::StorageProvider;
use context_manager::structs::context::ChatContext;
use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{Mutex as TokioMutex, RwLock};
use tool_system::registry::ToolRegistry;
use tracing;
use uuid::Uuid;

/// Manages chat contexts with LRU caching and persistence.
///
/// Lock Ordering Rules (to prevent deadlocks):
/// 1. Always acquire cache lock before context lock
/// 2. Release cache lock before acquiring context lock when possible
/// 3. Keep lock scopes minimal
pub struct ChatSessionManager<T: StorageProvider> {
    pub(crate) storage: Arc<T>,
    /// LRU cache of active contexts. Each context is protected by RwLock for concurrent reads.
    pub(crate) cache: TokioMutex<LruCache<Uuid, Arc<RwLock<ChatContext>>>>,
    /// Tool registry for injecting available tools into contexts
    pub(crate) tool_registry: Arc<StdMutex<ToolRegistry>>,
}

impl<T: StorageProvider> ChatSessionManager<T> {
    pub fn new(
        storage: Arc<T>,
        cache_size: usize,
        tool_registry: Arc<StdMutex<ToolRegistry>>,
    ) -> Self {
        Self {
            storage,
            cache: TokioMutex::new(LruCache::new(NonZeroUsize::new(cache_size).unwrap())),
            tool_registry,
        }
    }

    /// Inject available tools into a context based on agent role and permissions
    pub(crate) async fn inject_tools(&self, ctx: &mut ChatContext) {
        let tool_registry = self.tool_registry.lock().unwrap();

        // Get agent permissions based on role
        let permissions = ctx.config.agent_role.permissions();
        let tool_permissions = converters::convert_permissions(permissions);

        // Filter tools by permissions (includes hidden tools for AI use)
        let tool_defs = tool_registry.filter_tools_for_ai(&tool_permissions);

        // Convert and inject tools
        let converted_tools = converters::convert_tool_definitions(tool_defs);
        ctx.available_tools = converted_tools;

        tracing::debug!(
            context_id = %ctx.id,
            tool_count = ctx.available_tools.len(),
            agent_role = ?ctx.config.agent_role,
            "SessionManager: Injected tools into context"
        );
    }

    // Re-export lifecycle operations
    pub async fn create_session(
        &self,
        model_id: String,
        mode: String,
        trace_id: Option<String>,
    ) -> Result<Arc<RwLock<ChatContext>>, AppError> {
        lifecycle::create_session(self, model_id, mode, trace_id).await
    }

    pub async fn delete_context(&self, id: Uuid) -> Result<(), AppError> {
        lifecycle::delete_context(self, id).await
    }

    pub async fn list_contexts(&self) -> Result<Vec<Uuid>, AppError> {
        lifecycle::list_contexts(self).await
    }

    // Re-export persistence operations
    pub async fn load_context(
        &self,
        session_id: Uuid,
        trace_id: Option<String>,
    ) -> Result<Option<Arc<RwLock<ChatContext>>>, AppError> {
        persistence::load_context(self, session_id, trace_id).await
    }

    pub async fn save_context(&self, context: &mut ChatContext) -> Result<(), AppError> {
        persistence::save_context(self, context).await
    }

    pub async fn auto_save_if_dirty(
        &self,
        context: &Arc<RwLock<ChatContext>>,
    ) -> Result<(), AppError> {
        persistence::auto_save_if_dirty(self, context).await
    }

    pub async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<(), AppError> {
        persistence::save_system_prompt_snapshot(self, context_id, snapshot).await
    }
}
