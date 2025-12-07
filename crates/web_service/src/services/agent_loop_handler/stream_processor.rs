//! SSE stream processing for agent loop
//!
//! This module handles Server-Sent Events streaming logic
//! that was previously embedded in mod.rs.

use super::{initialization, message_intake, utils};
use crate::{
    error::AppError,
    models::{MessagePayload, SendMessageRequest},
    services::{
        agent_loop_runner::AgentLoopRunner,
        copilot_stream_handler,
        llm_request_builder::LlmRequestBuilder,
        message_builder,
        message_processing::{
            FileReferenceHandler, TextMessageHandler, ToolResultHandler, WorkflowHandler,
        },
        session_manager::ChatSessionManager,
        sse_response_builder,
        AgentService, EventBroadcaster,
    },
    storage::StorageProvider,
};
use tool_system::ToolExecutor;
use actix_web_lab::sse;
use anyhow::Result;
use bytes::Bytes;
use context_manager::{ChatContext, ContextUpdate};
use copilot_client::CopilotClientTrait;
use futures_util::StreamExt;
use log::{error, info};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

/// Create and return SSE stream for message processing
#[allow(clippy::too_many_arguments)]
pub async fn create_sse_stream<T: StorageProvider + 'static>(
    session_manager: Arc<ChatSessionManager<T>>,
    copilot_client: Arc<dyn CopilotClientTrait>,
    event_broadcaster: Option<Arc<EventBroadcaster>>,
    llm_request_builder: LlmRequestBuilder,
    agent_service: Arc<AgentService>,
    tool_executor: Arc<ToolExecutor>,
    approval_manager: Arc<crate::services::approval_manager::ApprovalManager>,
    file_reference_handler: &FileReferenceHandler<T>,
    workflow_handler: &WorkflowHandler<T>,
    tool_result_handler: &ToolResultHandler<T>,
    text_message_handler: &TextMessageHandler<T>,
    conversation_id: Uuid,
    request: SendMessageRequest,
) -> Result<
    sse::Sse<
        actix_web_lab::util::InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>,
    >,
    AppError,
> {
    info!(
        "Stream Processor: Creating SSE stream for conversation {}",
        conversation_id
    );

    // 1. Load context
    let context =
        initialization::load_context_for_request(&session_manager, conversation_id, &request)
            .await?;
    let display_text = message_builder::compute_display_text(&request);
    let (event_tx, event_rx) = mpsc::channel::<sse::Event>(100);

    // 2. Handle special payloads
    if let Some(_response) = message_intake::handle_request_payload(
        file_reference_handler,
        workflow_handler,
        tool_result_handler,
        text_message_handler,
        &context,
        conversation_id,
        &request.payload,
        &display_text,
        &request.client_metadata,
    )
    .await?
    {
        let context_id = {
            let ctx = context.read().await;
            ctx.id
        };

        match &request.payload {
            MessagePayload::Workflow { .. } | MessagePayload::ToolResult { .. } => {
                info!("Stream Processor: Early return for special payload");
                return sse_response_builder::build_message_signal_sse(
                    context_id,
                    Uuid::new_v4(),
                    0,
                );
            }
            _ => {
                unreachable!("handle_request_payload only returns Some for Workflow/ToolResult")
            }
        }
    }

    // 3. Handle text messages inline
    if let MessagePayload::Text { content, display } = &request.payload {
        let incoming = message_builder::build_incoming_text_message(
            content,
            display.as_deref(),
            &request.client_metadata,
        );

        let stream = {
            let mut ctx = context.write().await;
            ctx.send_message(incoming)
                .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
        };
        let updates = stream.collect::<Vec<ContextUpdate>>().await;

        for update in updates {
            if utils::send_context_update(&event_tx, &update)
                .await
                .is_err()
            {
                log::warn!("Client disconnected before streaming");
                break;
            }
        }

        session_manager.auto_save_if_dirty(&context).await?;
    }

    let sse_response =
        sse::Sse::from_infallible_receiver(event_rx).with_keep_alive(Duration::from_secs(15));

    // 4. Build LLM request
    let llm_request = llm_request_builder.build(&context).await?;

    if let Err(e) = initialization::save_system_prompt_from_request(
        &session_manager,
        conversation_id,
        &llm_request,
    )
    .await
    {
        log::warn!("Failed to save system prompt snapshot: {}", e);
    }

    info!(
        "Stream Processor: Calling LLM with {} messages",
        llm_request.request.messages.len()
    );

    let mut request = llm_request.request.clone();
    request.stream = Some(true);

    // 5. Transition to AwaitingLLMResponse
    {
        let mut ctx = context.write().await;
        let updates = ctx.transition_to_awaiting_llm();
        info!("FSM: Transitioned to AwaitingLLMResponse");

        for update in updates {
            let _ = utils::send_context_update(&event_tx, &update).await;
        }
    }

    // 6. Call LLM and setup streaming
    let response = copilot_client
        .send_chat_completion_request(request)
        .await
        .map_err(|e| AppError::InternalError(anyhow::anyhow!("LLM call failed: {}", e)))?;

    let status = response.status();
    if !status.is_success() {
        let body_text = response.text().await.unwrap_or_default();
        let error_msg = if body_text.is_empty() {
            format!("LLM API error. Status: {}", status)
        } else {
            format!("LLM API error. Status: {} Body: {}", status, body_text)
        };

        let updates = {
            let mut ctx = context.write().await;
            ctx.handle_llm_error(error_msg.clone())
        };

        for update in updates {
            let _ = utils::send_context_update(&event_tx, &update).await;
        }

        return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
    }

    // 7. Stream processing
    let (chunk_tx, chunk_rx) = mpsc::channel::<Result<Bytes>>(100);
    let copilot_client_clone = copilot_client.clone();
    let processor_handle = tokio::spawn(async move {
        copilot_client_clone
            .process_chat_completion_stream(response, chunk_tx)
            .await
    });

    copilot_stream_handler::spawn_stream_task(
        chunk_rx,
        processor_handle,
        session_manager,
        agent_service,
        tool_executor,
        approval_manager,
        conversation_id,
        event_tx.clone(),
    );

    drop(event_tx);

    Ok(sse_response)
}
