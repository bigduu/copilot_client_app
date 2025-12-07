//! LLM request processing and response handling
//!
//! This module handles all LLM interaction logic that was previously
//! embedded in mod.rs, providing a clean separation of concerns.

use super::error_handling;
use crate::{
    error::AppError,
    models::ServiceResponse,
    services::{copilot_stream_handler, session_manager::ChatSessionManager, EventBroadcaster},
    storage::StorageProvider,
};
use anyhow::Result;
use bytes::Bytes;
use context_manager::structs::context::ChatContext;
use copilot_client::{api::models::ChatCompletionRequest, CopilotClientTrait};
use log::{error, info};

// Import reqwest types via re-export
use reqwest::{Response, StatusCode};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

/// Process LLM request (non-streaming)
///
/// Handles the complete LLM interaction lifecycle:
/// 1. Transition context to AwaitingLLMResponse
/// 2. Send request to LLM
/// 3. Process streamed response chunks
/// 4. Handle completion or errors
/// 5. Auto-save context
pub async fn process_llm_request<T: StorageProvider>(
    copilot_client: &Arc<dyn CopilotClientTrait>,
    session_manager: &Arc<ChatSessionManager<T>>,
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    context: &Arc<RwLock<ChatContext>>,
    mut request: ChatCompletionRequest,
    conversation_id: Uuid,
) -> Result<ServiceResponse, AppError> {
    info!(
        "LLM Processor: Processing request with {} messages",
        request.messages.len()
    );

    // Ensure streaming is enabled
    request.stream = Some(true);

    // Transition to AwaitingLLMResponse using context_manager method
    {
        let mut ctx = context.write().await;
        let _updates = ctx.transition_to_awaiting_llm();
        info!("FSM: Transitioned to AwaitingLLMResponse");
    }

    // Call LLM
    match copilot_client.send_chat_completion_request(request).await {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                let body_text = response.text().await.unwrap_or_default();
                let error_msg = format_llm_error(status, &body_text);
                error!("{}", error_msg);
                
                // Use context_manager's error handling
                {
                    let mut ctx = context.write().await;
                    let _updates = ctx.handle_llm_error(error_msg.clone());
                }
                
                return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
            }

            process_llm_stream(
                copilot_client,
                session_manager,
                event_broadcaster,
                context,
                response,
                conversation_id,
            )
            .await
        }
        Err(e) => {
            error!("Failed to send request to LLM: {}", e);
            
            // Use context_manager's error handling
            {
                let mut ctx = context.write().await;
                let _updates = ctx.handle_llm_error(e.to_string());
            }
            
            Err(AppError::InternalError(anyhow::anyhow!("LLM request failed: {}", e)))
        }
    }
}

/// Process LLM response stream
async fn process_llm_stream<T: StorageProvider>(
    copilot_client: &Arc<dyn CopilotClientTrait>,
    session_manager: &Arc<ChatSessionManager<T>>,
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    context: &Arc<RwLock<ChatContext>>,
    response: Response,
    conversation_id: Uuid,
) -> Result<ServiceResponse, AppError> {
    let mut full_text = String::new();
    let mut assistant_message_id: Option<Uuid> = None;

    let (chunk_tx, mut chunk_rx) = mpsc::channel::<Result<Bytes>>(100);
    let copilot_client_clone = copilot_client.clone();
    let processor_handle = tokio::spawn(async move {
        copilot_client_clone
            .process_chat_completion_stream(response, chunk_tx)
            .await
    });

    // Process chunks
    while let Some(chunk_result) = chunk_rx.recv().await {
        match chunk_result {
            Ok(bytes) => {
                if bytes.as_ref() == b"[DONE]" {
                    info!("Stream completed");
                    break;
                }

                if let Ok(chunk) = serde_json::from_slice::<
                    copilot_client::api::models::ChatCompletionStreamChunk,
                >(&bytes)
                {
                    copilot_stream_handler::handle_stream_chunk(
                        context,
                        chunk,
                        &mut full_text,
                        &mut assistant_message_id,
                    )
                    .await?;
                }
            }
            Err(e) => {
                error!("Stream error: {}", e);
                return Err(error_handling::handle_llm_error(
                    session_manager,
                    context,
                    e.to_string(),
                )
                .await);
            }
        }
    }

    if let Err(e) = processor_handle.await {
        error!("Stream processor panicked: {}", e);
        return Err(error_handling::handle_llm_error(
            session_manager,
            context,
            "Stream processor panicked".to_string(),
        )
        .await);
    }

    // Send completion event
    send_completion_event(
        event_broadcaster,
        context,
        conversation_id,
        assistant_message_id,
    )
    .await;

    // Auto-save
    session_manager.auto_save_if_dirty(context).await?;

    info!("LLM Processor: Request completed successfully");
    Ok(ServiceResponse::FinalMessage(full_text))
}

/// Send SSE completion event
async fn send_completion_event(
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    context: &Arc<RwLock<ChatContext>>,
    conversation_id: Uuid,
    assistant_message_id: Option<Uuid>,
) {
    if let Some(msg_id) = assistant_message_id {
        let final_sequence = {
            let ctx = context.read().await;
            ctx.message_sequence(msg_id).unwrap_or(0)
        };

        error_handling::send_sse_event(
            event_broadcaster,
            crate::controllers::context::streaming::SignalEvent::MessageCompleted {
                context_id: conversation_id.to_string(),
                message_id: msg_id.to_string(),
                final_sequence,
                timestamp: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await;
    }
}

/// Format LLM error message
fn format_llm_error(status: StatusCode, body: &str) -> String {
    if body.is_empty() {
        format!("LLM API error. Status: {}", status)
    } else {
        format!("LLM API error. Status: {} Body: {}", status, body)
    }
}
