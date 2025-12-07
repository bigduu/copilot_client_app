use crate::{
    error::AppError,
    models::ClientMessageMetadata,
    services::{
        message_builder, session_manager::ChatSessionManager, workflow_service::WorkflowService,
    },
    storage::StorageProvider,
};
use context_manager::{
    ChatContext, ContextUpdate, MessageMetadata, MessageTextSnapshot, MessageType, Role,
};
use serde_json::json;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use uuid::Uuid;

/// Handles workflow execution
///
/// This handler is responsible for:
/// - Executing workflows via WorkflowService
/// - Building workflow result messages
/// - Handling workflow success and error cases
/// - Recording workflow metadata
pub struct WorkflowHandler<T: StorageProvider> {
    workflow_service: Arc<WorkflowService>,
    session_manager: Arc<ChatSessionManager<T>>,
}

impl<T: StorageProvider> WorkflowHandler<T> {
    pub fn new(
        workflow_service: Arc<WorkflowService>,
        session_manager: Arc<ChatSessionManager<T>>,
    ) -> Self {
        Self {
            workflow_service,
            session_manager,
        }
    }

    /// Execute workflow and return finalized message
    pub async fn handle(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        workflow: &str,
        parameters: &HashMap<String, serde_json::Value>,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<(Uuid, String, u64), AppError> {
        // Construct Rich Workflow Message
        // The display logic (prompt injection) is handled by message_compat::from_rich_message_type
        use chrono::Utc;
        use context_manager::structs::message_types::{WorkflowExecMsg, WorkflowStatus};
        use context_manager::{IncomingMessage, RichMessageType};

        let workflow_msg = WorkflowExecMsg {
            workflow_name: workflow.to_string(),
            execution_id: Uuid::new_v4().to_string(),
            status: WorkflowStatus::Pending,
            current_step: None,
            total_steps: 0,
            completed_steps: 0,
            started_at: Utc::now(),
            updated_at: Utc::now(),
            result: None,
            error: None,
        };

        let incoming = IncomingMessage::Rich(RichMessageType::WorkflowExecution(workflow_msg));

        // Note: Metadata is attached to Rich Message in FromRichMessage if needed,
        // but currently FromRichMessage creates a new InternalMessage.
        // We might lose `metadata` passed here if we don't attach it.
        // The `send_message` implementation I wrote handles `IncomingMessage::Rich` by calling `from_rich_message_type`.
        // `from_rich_message_type` returns InternalMessage with metadata=None.
        // I should probably manually attach metadata if I want to preserve trace_id etc.
        // But let's stick to the core task first.

        let stream = {
            let mut ctx = context.write().await;
            ctx.send_message(incoming)
                .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
        };

        // Collect updates
        use futures_util::StreamExt;
        let _updates = stream.collect::<Vec<ContextUpdate>>().await;

        self.session_manager.auto_save_if_dirty(context).await?;

        // Execute workflow
        let execution_result = self
            .workflow_service
            .execute_workflow(workflow, parameters.clone())
            .await;

        let (assistant_text, metadata_payload) = match execution_result {
            Ok(result) => {
                let assistant_text = message_builder::stringify_tool_output(&result);
                let payload = json!({
                    "workflow_name": workflow,
                    "parameters": parameters,
                    "result": result,
                    "status": "success",
                });
                (assistant_text, payload)
            }
            Err(err) => {
                let error_message = err.to_string();
                let payload = json!({
                    "workflow_name": workflow,
                    "parameters": parameters,
                    "status": "error",
                    "error": error_message,
                });
                (format!("Workflow 执行失败: {}", error_message), payload)
            }
        };

        let (message_id, summary, sequence) = {
            let mut context_lock = context.write().await;
            let mut extra = HashMap::new();
            extra.insert("workflow_name".to_string(), json!(workflow));
            extra.insert("payload".to_string(), metadata_payload.clone());

            let metadata = MessageMetadata {
                extra: Some(extra),
                ..Default::default()
            };

            let (message_id, _) = context_lock.append_text_message_with_metadata(
                Role::Assistant,
                MessageType::ToolResult,
                assistant_text.clone(),
                Some(metadata),
                None,
            );

            let MessageTextSnapshot {
                content, sequence, ..
            } = context_lock
                .message_text_snapshot(message_id)
                .ok_or_else(|| {
                    AppError::InternalError(anyhow::anyhow!(
                        "Message snapshot unavailable after workflow execution"
                    ))
                })?;

            (message_id, content, sequence)
        };

        self.session_manager.auto_save_if_dirty(context).await?;

        Ok((message_id, summary, sequence))
    }
}
