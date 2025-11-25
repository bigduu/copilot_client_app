//! Streaming domain
//!
//! This module handles SSE events and streaming content:
//! - Subscribe to Signal-Pull SSE events
//! - Get streaming chunks for messages

use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    get,
    web::{Data, Path, Query},
    HttpRequest, HttpResponse, Result,
};
use actix_web_lab::{sse, util::InfallibleStream};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing;
use uuid::Uuid;

// ============================================================================
// Types for streaming domain
// ============================================================================

#[derive(Serialize, Debug)]
pub struct StreamingChunksResponse {
    pub context_id: String,
    pub message_id: String,
    pub chunks: Vec<ChunkDTO>,
    pub current_sequence: u64,
    pub has_more: bool,
}

#[derive(Serialize, Debug)]
pub struct ChunkDTO {
    pub sequence: u64,
    pub delta: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalEvent {
    StateChanged {
        context_id: String,
        new_state: String,
        timestamp: String,
    },
    MessageCreated {
        message_id: String,
        role: String,
    },
    ContentDelta {
        context_id: String,
        message_id: String,
        current_sequence: u64,
        timestamp: String,
    },
    MessageCompleted {
        context_id: String,
        message_id: String,
        final_sequence: u64,
        timestamp: String,
    },
    TitleUpdated {
        context_id: String,
        title: String,
        timestamp: String,
    },
    Heartbeat {
        timestamp: String,
    },
}

impl SignalEvent {
    /// Extract the context_id from events that have it
    pub fn context_id(&self) -> &str {
        match self {
            SignalEvent::StateChanged { context_id, .. } => context_id,
            SignalEvent::ContentDelta { context_id, .. } => context_id,
            SignalEvent::MessageCompleted { context_id, .. } => context_id,
            SignalEvent::TitleUpdated { context_id, .. } => context_id,
            SignalEvent::MessageCreated { .. } | SignalEvent::Heartbeat { .. } => "",
        }
    }
}

#[derive(Deserialize, Debug, Default)]
pub struct MessageContentQuery {
    pub from_sequence: Option<u64>,
}

// ============================================================================
// Handlers
// ============================================================================

/// Get streaming chunks for a message (for Signal-Pull incremental content retrieval)
#[get("/contexts/{context_id}/messages/{message_id}/streaming-chunks")]
pub async fn get_streaming_chunks(
    path: Path<(Uuid, Uuid)>,
    query: Query<MessageContentQuery>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let (context_id, message_id) = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    let from_sequence = query.from_sequence.unwrap_or(0);

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        message_id = %message_id,
        from_sequence = from_sequence,
        "get_streaming_chunks endpoint called"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let (chunks_opt, current_seq_opt) = {
                let ctx = context.read().await;
                let chunks = ctx.get_streaming_chunks_after(message_id, from_sequence);
                let current_seq = ctx.get_streaming_sequence(message_id);
                (chunks, current_seq)
            };

            match (chunks_opt, current_seq_opt) {
                (Some(chunks), Some(current_sequence)) => {
                    let chunk_dtos: Vec<ChunkDTO> = chunks
                        .into_iter()
                        .map(|(seq, delta)| ChunkDTO {
                            sequence: seq,
                            delta,
                        })
                        .collect();

                    let has_more = !chunk_dtos.is_empty();

                    let response = StreamingChunksResponse {
                        context_id: context_id.to_string(),
                        message_id: message_id.to_string(),
                        chunks: chunk_dtos,
                        current_sequence,
                        has_more,
                    };

                    Ok(HttpResponse::Ok().json(response))
                }
                (None, _) | (_, None) => {
                    tracing::info!(
                        trace_id = ?trace_id,
                        context_id = %context_id,
                        message_id = %message_id,
                        "Message not found or not a streaming message"
                    );
                    Ok(HttpResponse::NotFound().json(serde_json::json!({
                        "error": "Message not found or not a streaming message"
                    })))
                }
            }
        }
        Ok(None) => {
            tracing::info!(
                trace_id = ?trace_id,
                context_id = %context_id,
                "Context not found"
            );
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(e) => {
            tracing::error!(
                trace_id = ?trace_id,
                context_id = %context_id,
                error = %e,
                "Failed to load context for streaming chunks"
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

/// Subscribe to Signal-Pull SSE events for a context
/// This endpoint establishes a Server-Sent Events stream for lightweight signals.
/// Frontend should use REST APIs to pull actual data upon receiving signals.
#[get("/contexts/{id}/events")]
pub async fn subscribe_context_events(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<sse::Sse<InfallibleStream<ReceiverStream<sse::Event>>>> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "SSE subscription requested for context events"
    );

    // Verify context exists
    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(_context)) => {
            // Subscribe to the event broadcaster for this context
            let mut event_rx = app_state.event_broadcaster.subscribe(context_id).await;

            let (tx, rx) = mpsc::channel::<sse::Event>(32);

            // Spawn a background task to forward events from broadcaster to SSE
            let context_id_str = context_id.to_string();

            tokio::spawn(async move {
                let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(30));

                loop {
                    tokio::select! {
                        // Forward events from broadcaster
                        Some(event) = event_rx.recv() => {
                            if tx.send(event).await.is_err() {
                                tracing::debug!(
                                    context_id = %context_id_str,
                                    "SSE client disconnected while sending event"
                                );
                                break;
                            }
                        }
                        // Send periodic heartbeat
                        _ = heartbeat_interval.tick() => {
                            let event = SignalEvent::Heartbeat {
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            };

                            if let Ok(data) = sse::Data::new_json(&event) {
                                if tx.send(sse::Event::Data(data.event("signal"))).await.is_err() {
                                    tracing::debug!(
                                        context_id = %context_id_str,
                                        "SSE client disconnected (heartbeat)"
                                    );
                                    break;
                                }
                            }
                        }
                    }
                }

                tracing::info!(
                    context_id = %context_id_str,
                    "SSE event stream closed"
                );
            });

            let sse_stream =
                sse::Sse::from_infallible_receiver(rx).with_keep_alive(Duration::from_secs(15));

            Ok(sse_stream)
        }
        Ok(None) => {
            tracing::warn!(
                trace_id = ?trace_id,
                context_id = %context_id,
                "Context not found for SSE subscription"
            );
            Err(actix_web::error::ErrorNotFound("Context not found"))
        }
        Err(e) => {
            tracing::error!(
                trace_id = ?trace_id,
                context_id = %context_id,
                error = %e,
                "Failed to load context for SSE subscription"
            );
            Err(actix_web::error::ErrorInternalServerError(
                "Failed to load context",
            ))
        }
    }
}
