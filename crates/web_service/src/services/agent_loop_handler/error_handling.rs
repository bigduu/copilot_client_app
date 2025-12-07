//! Error handling phase - LLM errors and SSE notifications

use crate::{
    error::AppError,
    services::{session_manager::ChatSessionManager, EventBroadcaster},
    storage::StorageProvider,
};
use context_manager::{ChatContext, MessageMetadata, MessageType, Role};
use serde_json::json;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use uuid::Uuid;

/// Send SSE event for signal-pull updates
pub(super) async fn send_sse_event(
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    event: crate::controllers::context::streaming::SignalEvent,
) {
    if let Some(broadcaster) = event_broadcaster {
        log::debug!("Sending SSE event: {:?}", event);
        if let Ok(data) = actix_web_lab::sse::Data::new_json(&event) {
            broadcaster
                .broadcast(
                    Uuid::parse_str(event.context_id()).unwrap_or_default(),
                    actix_web_lab::sse::Event::Data(data.event("signal")),
                )
                .await;
        }
    }
}

/// Handle LLM error and record error message
pub(super) async fn handle_llm_error<T: StorageProvider>(
    session_manager: &Arc<ChatSessionManager<T>>,
    context: &Arc<RwLock<ChatContext>>,
    error_msg: String,
) -> AppError {
    let mut context_lock = context.write().await;
    let _updates = context_lock.handle_llm_error(error_msg.clone());

    let mut extra = HashMap::new();
    extra.insert("error".to_string(), json!(error_msg));
    let metadata = MessageMetadata {
        extra: Some(extra),
        ..Default::default()
    };

    context_lock.append_text_message_with_metadata(
        Role::Assistant,
        MessageType::Text,
        format!("I ran into a problem talking to the model: {}", error_msg),
        Some(metadata),
        None,
    );
    drop(context_lock);

    let _ = session_manager.auto_save_if_dirty(context).await;
    AppError::InternalError(anyhow::anyhow!(error_msg))
}
