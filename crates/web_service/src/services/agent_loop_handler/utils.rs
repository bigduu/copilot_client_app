//! Utility functions for agent loop handler

use crate::error::AppError;
use context_manager::ContextUpdate;
use tokio::sync::mpsc;

/// Helper for sending context updates to SSE
pub(super) async fn send_context_update(
    tx: &mpsc::Sender<actix_web_lab::sse::Event>,
    update: &ContextUpdate,
) -> Result<(), AppError> {
    if let Ok(data) = actix_web_lab::sse::Data::new_json(update) {
        tx.send(actix_web_lab::sse::Event::Data(
            data.event("context_update"),
        ))
        .await
        .map_err(|_| AppError::InternalError(anyhow::anyhow!("SSE channel closed")))?;
    }
    Ok(())
}
