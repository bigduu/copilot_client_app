use crate::{
    error::AppError,
    models::ClientMessageMetadata,
    services::{message_builder, session_manager::ChatSessionManager},
    storage::StorageProvider,
};
use context_manager::{ChatContext, ContextUpdate};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Handles plain text message processing
///
/// This handler is responsible for:
/// - Processing plain text messages from users
/// - Adding messages to the context
/// - Managing auto-save after message additions
pub struct TextMessageHandler<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
}

impl<T: StorageProvider> TextMessageHandler<T> {
    pub fn new(session_manager: Arc<ChatSessionManager<T>>) -> Self {
        Self { session_manager }
    }

    /// Handle plain text message
    /// Returns Ok(()) to allow AI call to proceed
    pub async fn handle(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        content: &str,
        display: Option<&str>,
        metadata: &ClientMessageMetadata,
    ) -> Result<(), AppError> {
        let incoming = message_builder::build_incoming_text_message(
            content,
            display,
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

        Ok(())
    }
}
