use crate::error::AppError;
use crate::services::approval_manager::ApprovalManager;
use crate::services::session_manager::ChatSessionManager;
use crate::storage::StorageProvider;
use context_manager::{
    ChatContext, ContentPart, ContextUpdate, DisplayPreference, InternalMessage, MessageType,
    MessageUpdate, Role, ToolCallResult,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tool_system::types::ToolArguments;
pub use tool_system::ToolExecutor;
use uuid::Uuid;

/// Options for tool execution
#[derive(Debug, Clone)]
pub struct ToolExecutionOptions {
    /// Request ID if tool was approved
    pub request_id: Option<Uuid>,
    /// Whether to terminate auto-loop after this tool
    pub terminate: bool,
    /// Display preference override (Hidden for read_file/list_directory)
    pub display_preference: Option<DisplayPreference>,
}

impl Default for ToolExecutionOptions {
    fn default() -> Self {
        Self {
            request_id: None,
            terminate: false,
            display_preference: None,
        }
    }
}

/// Unified tool execution coordinator
///
/// Replaces the 4-layer indirection:
/// - ChatService/AgentLoop → process_auto_tool_step → ContextToolRuntime → ToolExecutor
///
/// With 2 layers:
/// - ChatService/AgentLoop → ToolCoordinator → ToolExecutor
pub struct ToolCoordinator<T: StorageProvider> {
    executor: Arc<ToolExecutor>,
    approval_manager: Arc<ApprovalManager>,
    session_manager: Arc<ChatSessionManager<T>>,
}

impl<T: StorageProvider> Clone for ToolCoordinator<T> {
    fn clone(&self) -> Self {
        Self {
            executor: self.executor.clone(),
            approval_manager: self.approval_manager.clone(),
            session_manager: self.session_manager.clone(),
        }
    }
}

impl<T: StorageProvider> ToolCoordinator<T> {
    /// Create a new ToolCoordinator
    pub fn new(
        executor: Arc<ToolExecutor>,
        approval_manager: Arc<ApprovalManager>,
        session_manager: Arc<ChatSessionManager<T>>,
    ) -> Self {
        Self {
            executor,
            approval_manager,
            session_manager,
        }
    }

    /// Execute a tool with full lifecycle management
    ///
    /// This method consolidates:
    /// 1. Approval checking
    /// 2. Auto-loop tracking
    /// 3. Tool execution
    /// 4. Result recording
    /// 5. Message creation
    /// 6. Auto-save
    ///
    /// Returns all ContextUpdates generated during execution.
    pub async fn execute_tool(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        tool_name: String,
        arguments: Value,
        options: ToolExecutionOptions,
    ) -> Result<Vec<ContextUpdate>, AppError> {
        let mut updates = Vec::new();

        // 1. Check approval if no request_id provided
        if options.request_id.is_none() {
            if let Some(definition) = self.executor.get_tool_definition(&tool_name) {
                if definition.requires_approval {
                    return self
                        .request_approval(context, tool_name, arguments, options.terminate)
                        .await;
                }
            }
        }

        // 2. Record tool execution start
        {
            let mut ctx = context.write().await;
            let depth = ctx.tool_execution.auto_loop_depth() + 1;
            updates.push(ctx.begin_auto_loop(depth));
            updates.push(ctx.begin_tool_execution(&tool_name, 1, options.request_id));
        }

        // 3. Execute tool
        let execution_result = self
            .executor
            .execute_tool(&tool_name, ToolArguments::Json(arguments.clone()))
            .await;

        // 4. Handle result
        match execution_result {
            Ok(result) => {
                self.handle_success(
                    context,
                    &mut updates,
                    tool_name,
                    result,
                    options.request_id,
                    options.display_preference,
                )
                .await?;
            }
            Err(e) => {
                self.handle_failure(context, &mut updates, tool_name, e.to_string())
                    .await?;
            }
        }

        // 5. Auto-save
        self.session_manager.auto_save_if_dirty(context).await?;

        Ok(updates)
    }

    /// Handle successful tool execution
    async fn handle_success(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        updates: &mut Vec<ContextUpdate>,
        tool_name: String,
        result: Value,
        request_id: Option<Uuid>,
        display_preference_override: Option<DisplayPreference>,
    ) -> Result<(), AppError> {
        let (message_id, final_message, sequence) = {
            let mut ctx = context.write().await;

            // Record progress and completion
            updates.push(ctx.record_auto_loop_progress());

            let mut execution_update = ctx.complete_tool_execution();
            execution_update
                .metadata
                .insert("result".to_string(), result.clone());
            execution_update
                .metadata
                .insert("tool_name".to_string(), json!(tool_name));
            if let Some(req_id) = request_id {
                execution_update
                    .metadata
                    .insert("request_id".to_string(), json!(req_id));
            }
            updates.push(execution_update);

            updates.push(ctx.complete_auto_loop());

            // Determine display preference
            let display_preference = display_preference_override.unwrap_or_else(|| {
                if tool_name == "read_file" || tool_name == "list_directory" {
                    DisplayPreference::Hidden
                } else {
                    DisplayPreference::Default
                }
            });

            // Format result and create message
            let message_text = Self::format_tool_output(&result);
            let final_message = InternalMessage {
                role: Role::Tool,
                content: vec![ContentPart::text_owned(message_text.clone())],
                tool_result: Some(ToolCallResult {
                    request_id: tool_name.clone(),
                    result: result.clone(),
                    display_preference,
                }),
                message_type: MessageType::ToolResult,
                ..Default::default()
            };

            let message_id = ctx.add_message_to_branch("main", final_message.clone());
            let sequence = ctx.ensure_sequence_at_least(message_id, 1);

            (message_id, final_message, sequence)
        };

        // Create ContextUpdates for message
        let mut created_metadata = HashMap::new();
        created_metadata.insert("sequence".to_string(), json!(sequence));
        if let Some(req_id) = request_id {
            created_metadata.insert("request_id".to_string(), json!(req_id));
        }

        let ctx_guard = context.read().await;
        updates.push(ContextUpdate {
            context_id: ctx_guard.id,
            current_state: ctx_guard.current_state.clone(),
            previous_state: Some(ctx_guard.current_state.clone()),
            message_update: Some(MessageUpdate::Created {
                message_id,
                role: Role::Tool,
                message_type: MessageType::ToolResult,
            }),
            timestamp: chrono::Utc::now(),
            metadata: created_metadata,
        });

        let mut completed_metadata = HashMap::new();
        completed_metadata.insert("sequence".to_string(), json!(sequence));
        if let Some(req_id) = request_id {
            completed_metadata.insert("request_id".to_string(), json!(req_id));
        }

        updates.push(ContextUpdate {
            context_id: ctx_guard.id,
            current_state: ctx_guard.current_state.clone(),
            previous_state: Some(ctx_guard.current_state.clone()),
            message_update: Some(MessageUpdate::Completed {
                message_id,
                final_message,
            }),
            timestamp: chrono::Utc::now(),
            metadata: completed_metadata,
        });

        drop(ctx_guard);

        Ok(())
    }

    /// Handle tool execution failure
    async fn handle_failure(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        updates: &mut Vec<ContextUpdate>,
        tool_name: String,
        error_message: String,
    ) -> Result<(), AppError> {
        let mut ctx = context.write().await;

        updates.push(ctx.record_tool_execution_failure(&tool_name, 0, &error_message, None));
        Ok(())
    }

    /// Request approval for tool execution
    ///
    /// Returns an error indicating approval is needed.
    async fn request_approval(
        &self,
        _context: &Arc<RwLock<ChatContext>>,
        _tool_name: String,
        _arguments: Value,
        _terminate: bool,
    ) -> Result<Vec<ContextUpdate>, AppError> {
        // Return an error indicating that approval is needed
        // The actual approval flow will be handled by the caller
        Err(AppError::ToolApprovalRequired(format!(
            "Tool {} requires approval",
            _tool_name
        )))
    }

    /// Format tool output for display
    fn format_tool_output(value: &Value) -> String {
        match value {
            Value::String(s) => s.clone(),
            Value::Object(_) | Value::Array(_) => {
                serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
            }
            _ => value.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_tool_output_string() {
        let value = json!("Hello, World!");
        assert_eq!(
            ToolCoordinator::<crate::storage::message_pool_provider::MessagePoolStorageProvider>::format_tool_output(&value),
            "Hello, World!"
        );
    }

    #[test]
    fn test_format_tool_output_object() {
        let value = json!({"key": "value"});
        let output = ToolCoordinator::<
            crate::storage::message_pool_provider::MessagePoolStorageProvider,
        >::format_tool_output(&value);
        assert!(output.contains("key"));
        assert!(output.contains("value"));
    }

    #[test]
    fn test_tool_execution_options_default() {
        let options = ToolExecutionOptions::default();
        assert_eq!(options.request_id, None);
        assert_eq!(options.terminate, false);
        assert_eq!(options.display_preference, None);
    }
}
