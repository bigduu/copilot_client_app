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
    storage: Arc<T>,
    /// LRU cache of active contexts. Each context is protected by RwLock for concurrent reads.
    cache: TokioMutex<LruCache<Uuid, Arc<RwLock<ChatContext>>>>,
    /// Tool registry for injecting available tools into contexts
    tool_registry: Arc<StdMutex<ToolRegistry>>,
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

    /// Convert tool_system ToolDefinition to context_manager ToolDefinition
    fn convert_tool_definitions(
        &self,
        tool_defs: Vec<tool_system::types::ToolDefinition>,
    ) -> Vec<context_manager::pipeline::context::ToolDefinition> {
        tool_defs
            .into_iter()
            .map(|def| {
                // Convert parameters Vec<Parameter> to JSON Schema
                let parameters_schema = if def.parameters.is_empty() {
                    serde_json::json!({
                        "type": "object",
                        "properties": {},
                        "required": []
                    })
                } else {
                    let mut properties = serde_json::Map::new();
                    let mut required = Vec::new();

                    for param in &def.parameters {
                        let mut param_schema = serde_json::Map::new();
                        // Default to string type since Parameter doesn't have type info
                        param_schema.insert("type".to_string(), serde_json::json!("string"));
                        param_schema.insert(
                            "description".to_string(),
                            serde_json::json!(param.description),
                        );

                        properties
                            .insert(param.name.clone(), serde_json::Value::Object(param_schema));

                        if param.required {
                            required.push(param.name.clone());
                        }
                    }

                    serde_json::json!({
                        "type": "object",
                        "properties": properties,
                        "required": required
                    })
                };

                // Convert ToolCategory enum to string
                let category_str = format!("{:?}", def.category);

                context_manager::pipeline::context::ToolDefinition {
                    name: def.name,
                    description: def.description,
                    category: category_str,
                    parameters_schema,
                    requires_approval: def.requires_approval,
                }
            })
            .collect()
    }

    /// Convert context_manager Permission to tool_system ToolPermission
    fn convert_permissions(
        permissions: Vec<context_manager::structs::context_agent::Permission>,
    ) -> Vec<tool_system::types::ToolPermission> {
        permissions
            .into_iter()
            .map(|perm| match perm {
                context_manager::structs::context_agent::Permission::ReadFiles => {
                    tool_system::types::ToolPermission::ReadFiles
                }
                context_manager::structs::context_agent::Permission::WriteFiles => {
                    tool_system::types::ToolPermission::WriteFiles
                }
                context_manager::structs::context_agent::Permission::CreateFiles => {
                    tool_system::types::ToolPermission::CreateFiles
                }
                context_manager::structs::context_agent::Permission::DeleteFiles => {
                    tool_system::types::ToolPermission::DeleteFiles
                }
                context_manager::structs::context_agent::Permission::ExecuteCommands => {
                    tool_system::types::ToolPermission::ExecuteCommands
                }
            })
            .collect()
    }

    /// Inject available tools into a context based on agent role and permissions
    async fn inject_tools(&self, ctx: &mut ChatContext) {
        let tool_registry = self.tool_registry.lock().unwrap();

        // Get agent permissions based on role
        let permissions = ctx.config.agent_role.permissions();
        let tool_permissions = Self::convert_permissions(permissions);

        // Filter tools by permissions (includes hidden tools for AI use)
        let tool_defs = tool_registry.filter_tools_for_ai(&tool_permissions);

        // Convert and inject tools
        let converted_tools = self.convert_tool_definitions(tool_defs);
        ctx.available_tools = converted_tools;

        tracing::debug!(
            context_id = %ctx.id,
            tool_count = ctx.available_tools.len(),
            agent_role = ?ctx.config.agent_role,
            "SessionManager: Injected tools into context"
        );
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

        // Inject available tools based on agent role
        self.inject_tools(&mut ctx).await;

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
            // Re-inject tools for cached context (tools are not persisted)
            {
                let mut ctx = context.write().await;
                self.inject_tools(&mut ctx).await;

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

            // Inject available tools (tools are not persisted, need to be injected at runtime)
            self.inject_tools(&mut context).await;

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

    pub async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<(), AppError> {
        self.storage
            .save_system_prompt_snapshot(context_id, snapshot)
            .await?;
        Ok(())
    }
}
