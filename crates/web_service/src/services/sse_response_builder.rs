use actix_web_lab::{sse, util::InfallibleStream};
use serde_json::json;
use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::error::AppError;

/// SSE Response Builder
///
/// Utilities for building Server-Sent Events (SSE) responses
/// Used for streaming chat responses back to clients

/// Build a "Signal-Pull" SSE response for a completed message
///
/// This creates a minimal SSE stream that:
/// 1. Sends a `content_final` event with message details
/// 2. Sends a `done` event
/// 3. Sends `[DONE]` marker
/// 4. Closes the stream
///
/// The client can then use the message_id/sequence to pull the full message content
pub fn build_message_signal_sse(
    context_id: Uuid,
    message_id: Uuid,
    sequence: u64,
) -> Result<
    sse::Sse<InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>>,
    AppError,
> {
    let (tx, rx) = mpsc::channel::<sse::Event>(4);

    let payload = json!({
        "context_id": context_id,
        "message_id": message_id,
        "sequence": sequence,
        "is_final": true,
    });

    let content_event = sse::Data::new_json(payload)
        .map(|data| sse::Event::Data(data.event("content_final")))
        .map_err(|err| {
            AppError::InternalError(anyhow::anyhow!(format!(
                "Failed to serialise content_final payload: {}",
                err
            )))
        })?;

    // Use blocking_send since we're not in async context yet
    tx.blocking_send(content_event).map_err(|_| {
        AppError::InternalError(anyhow::anyhow!("Failed to emit content_final event"))
    })?;

    if let Ok(done_event) = sse::Data::new_json(json!({ "done": true })) {
        let _ = tx.blocking_send(sse::Event::Data(done_event.event("done")));
    }
    let _ = tx.blocking_send(sse::Event::Data(sse::Data::new("[DONE]")));

    drop(tx);

    Ok(sse::Sse::from_infallible_receiver(rx).with_keep_alive(Duration::from_secs(15)))
}

/// Create an SSE event for streaming content chunks
///
/// Used during streaming responses to send incremental content updates
pub fn create_content_chunk_event(
    context_id: Uuid,
    message_id: Uuid,
    chunk: String,
    sequence: u64,
) -> Result<sse::Event, AppError> {
    let payload = json!({
        "context_id": context_id,
        "message_id": message_id,
        "chunk": chunk,
        "sequence": sequence,
    });

    sse::Data::new_json(payload)
        .map(|data| sse::Event::Data(data.event("content_chunk")))
        .map_err(|err| {
            AppError::InternalError(anyhow::anyhow!(format!(
                "Failed to create content_chunk event: {}",
                err
            )))
        })
}

/// Create an SSE event for final content
///
/// Signals that streaming is complete for a message
pub fn create_content_final_event(
    context_id: Uuid,
    message_id: Uuid,
    sequence: u64,
) -> Result<sse::Event, AppError> {
    let payload = json!({
        "context_id": context_id,
        "message_id": message_id,
        "sequence": sequence,
        "is_final": true,
    });

    sse::Data::new_json(payload)
        .map(|data| sse::Event::Data(data.event("content_final")))
        .map_err(|err| {
            AppError::InternalError(anyhow::anyhow!(format!(
                "Failed to create content_final event: {}",
                err
            )))
        })
}

/// Create a "done" SSE event marker
pub fn create_done_event() -> sse::Event {
    sse::Event::Data(
        sse::Data::new_json(json!({ "done": true }))
            .unwrap()
            .event("done"),
    )
}

/// Create the final [DONE] marker event
pub fn create_done_marker_event() -> sse::Event {
    sse::Event::Data(sse::Data::new("[DONE]"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_content_chunk_event() {
        let context_id = Uuid::new_v4();
        let message_id = Uuid::new_v4();
        let event = create_content_chunk_event(context_id, message_id, "test".to_string(), 1);
        assert!(event.is_ok());
    }

    #[test]
    fn test_create_content_final_event() {
        let context_id = Uuid::new_v4();
        let message_id = Uuid::new_v4();
        let event = create_content_final_event(context_id, message_id, 5);
        assert!(event.is_ok());
    }

    #[test]
    fn test_create_done_event() {
        let event = create_done_event();
        // Just verify it creates without panicking
        assert!(matches!(event, sse::Event::Data(_)));
    }
}
