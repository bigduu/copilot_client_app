use crate::{
    error::AppError,
    models::ClientMessageMetadata,
    services::{message_builder, session_manager::ChatSessionManager},
    storage::StorageProvider,
};
use context_manager::{
    structs::tool::DisplayPreference, ChatContext, ContextUpdate, MessageMetadata,
    MessageTextSnapshot, MessageType, Role, ToolCallResult,
};
use serde_json::json;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use uuid::Uuid;

/// Handles tool result recording
///
/// This handler is responsible for:
/// - Recording tool execution results as messages
/// - Formatting tool output for display
/// - Attaching metadata to tool result messages
pub struct ToolResultHandler<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
}

impl<T: StorageProvider> ToolResultHandler<T> {
    pub fn new(session_manager: Arc<ChatSessionManager<T>>) -> Self {
        Self { session_manager }
    }

    /// Record tool result message and return finalized message
    pub async fn handle(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        tool_name: &str,
        result: serde_json::Value,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<(Uuid, String, u64), AppError> {
        // Add user message
        let incoming = message_builder::build_incoming_text_message(
            display_text,
            Some(display_text),
            metadata,
        );
        
        let stream = {
            let mut ctx = context.write().await;
            ctx.send_message(incoming)
                .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
        };

        // Collect updates
        use futures_util::StreamExt;
        let _updates = stream.collect::<Vec<ContextUpdate>>().await;
        
        self.session_manager.auto_save_if_dirty(context).await?;

        let tool_result_text = message_builder::stringify_tool_output(&result);

        let (message_id, summary, sequence) = {
            let mut context_lock = context.write().await;

            let mut extra = HashMap::new();
            extra.insert("tool_name".to_string(), json!(tool_name));
            extra.insert("payload".to_string(), result.clone());

            let message_metadata = MessageMetadata {
                extra: Some(extra),
                ..Default::default()
            };

            let (message_id, _) = context_lock.append_text_message_with_metadata(
                Role::Tool,
                MessageType::ToolResult,
                tool_result_text.clone(),
                Some(message_metadata),
                Some(ToolCallResult {
                    request_id: tool_name.to_string(),
                    result: result.clone(),
                    display_preference: DisplayPreference::Default,
                }),
            );

            let MessageTextSnapshot {
                content, sequence, ..
            } = context_lock
                .message_text_snapshot(message_id)
                .ok_or_else(|| {
                    AppError::InternalError(anyhow::anyhow!(
                        "Message snapshot unavailable after recording tool result"
                    ))
                })?;

            (message_id, content, sequence)
        };

        self.session_manager.auto_save_if_dirty(context).await?;

        Ok((message_id, summary, sequence))
    }
}
