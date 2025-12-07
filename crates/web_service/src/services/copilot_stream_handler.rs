use std::sync::Arc;

use chrono::Utc;
use std::collections::HashMap;
use actix_web_lab::sse;
use bytes::Bytes;
use context_manager::{ChatContext, ChatEvent, MessageUpdate, ContextUpdate};
use copilot_client::api::models::ChatCompletionStreamChunk;
use serde_json::json;
use tokio::sync::{mpsc, RwLock};
use tokio::task::JoinHandle;
use tool_system::ToolExecutor;
use uuid::Uuid;

use crate::services::agent_service::AgentService;
use crate::services::approval_manager::ApprovalManager;
use crate::services::llm_utils::send_context_update;
use crate::services::session_manager::ChatSessionManager;
use crate::services::tool_auto_loop_handler::{send_content_signal, ToolAutoLoopHandler};
use crate::storage::StorageProvider;

/// Handle a single stream chunk and update the context
pub async fn handle_stream_chunk(
    context: &Arc<RwLock<ChatContext>>,
    chunk: ChatCompletionStreamChunk,
    full_text: &mut String,
    assistant_message_id: &mut Option<Uuid>,
    tool_accumulator: &mut copilot_client::api::stream_tool_accumulator::StreamToolAccumulator,
) -> anyhow::Result<()> {
    if let Some(choice) = chunk.choices.first() {
        if let Some(content) = &choice.delta.content {
            let content_str = content.clone();
            full_text.push_str(&content_str);

            // Start streaming response if not already started
            if assistant_message_id.is_none() {
                let message_id = {
                    let mut ctx_lock = context.write().await;
                    ctx_lock.begin_streaming_llm_response(None)
                };
                *assistant_message_id = Some(message_id);
            }

            // Append chunk to the streaming message
            if let Some(message_id) = assistant_message_id {
                let mut ctx_lock = context.write().await;
                ctx_lock.append_streaming_chunk(*message_id, content_str.clone());
            }
        }

        // Process tool calls
        if let Some(tool_calls) = &choice.delta.tool_calls {
            tool_accumulator.process_chunk(tool_calls);
            log::debug!("Accumulated {} tool call(s) from stream chunk", tool_calls.len());
        }
    }
    Ok(())
}

pub fn spawn_stream_task<T: StorageProvider + 'static>(
    mut chunk_rx: mpsc::Receiver<anyhow::Result<Bytes>>,
    processor_handle: JoinHandle<anyhow::Result<()>>,
    session_manager: Arc<ChatSessionManager<T>>,
    agent_service: Arc<AgentService>,
    tool_executor: Arc<ToolExecutor>,
    approval_manager: Arc<ApprovalManager>,
    conversation_id: Uuid,
    event_tx: mpsc::Sender<sse::Event>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let tx = event_tx.clone();

        let mut full_text = String::new();
        let mut stream_started = false;
        let mut assistant_message_id: Option<Uuid> = None;
        let mut client_disconnected = false;
        let mut stream_failed = false;
        let mut last_sequence: u64 = 0;
        let mut tool_accumulator = copilot_client::api::stream_tool_accumulator::StreamToolAccumulator::new();

        while let Some(chunk_result) = chunk_rx.recv().await {
            match chunk_result {
                Ok(bytes) => {
                    if bytes == &b"[DONE]"[..] {
                        log::info!("Stream completed");
                        break;
                    }

                    match serde_json::from_slice::<
                        copilot_client::api::models::ChatCompletionStreamChunk,
                    >(&bytes)
                    {
                        Ok(chunk) => {
                            if let Some(choice) = chunk.choices.first() {
                                // Process tool calls
                                if let Some(tool_calls) = &choice.delta.tool_calls {
                                    tool_accumulator.process_chunk(tool_calls);
                                    log::debug!("Accumulated {} tool call fragment(s)", tool_calls.len());
                                }

                                if let Some(content) = &choice.delta.content {
                                    let content_str = content.clone();
                                    full_text.push_str(&content_str);

                                    if !stream_started {
                                        stream_started = true;
                                        if let Ok(Some(ctx)) = session_manager
                                            .load_context(conversation_id, None)
                                            .await
                                        {
                                            let message_id = {
                                                let mut ctx_lock = ctx.write().await;
                                                // Use new streaming API
                                                ctx_lock.begin_streaming_llm_response(None)
                                            };
                                            assistant_message_id = Some(message_id);
                                        }
                                    }

                                    if let Some(message_id) = assistant_message_id {
                                        if let Ok(Some(ctx)) = session_manager
                                            .load_context(conversation_id, None)
                                            .await
                                        {
                                            let sequence_opt = {
                                                let mut ctx_lock = ctx.write().await;
                                                // Use new streaming API - append_streaming_chunk
                                                ctx_lock.append_streaming_chunk(
                                                    message_id,
                                                    content_str.clone(),
                                                )
                                            };

                                            if let Some(sequence) = sequence_opt {
                                                last_sequence = sequence;

                                                if send_content_signal(
                                                    &tx,
                                                    "content_delta",
                                                    conversation_id,
                                                    message_id,
                                                    sequence,
                                                    false,
                                                )
                                                .await
                                                .is_err()
                                                {
                                                    log::warn!(
                                                        "Client disconnected while streaming content metadata"
                                                    );
                                                    client_disconnected = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to parse chunk: {}", e);
                        }
                    }

                    if client_disconnected {
                        break;
                    }
                }
                Err(e) => {
                    log::error!("Error in stream: {}", e);
                    stream_failed = true;

                    if let Some(message_id) = assistant_message_id {
                        if let Ok(Some(ctx)) =
                            session_manager.load_context(conversation_id, None).await
                        {
                            let updates = {
                                let mut ctx_lock = ctx.write().await;
                                ctx_lock.abort_streaming_response(
                                    message_id,
                                    format!("stream error: {}", e),
                                )
                            };

                            for update in updates {
                                if send_context_update(&tx, &update).await.is_err() {
                                    log::warn!("Client disconnected while sending failure update");
                                    client_disconnected = true;
                                    break;
                                }
                            }
                        }
                    }

                    let mut send_failed = false;

                    if let Ok(data) = sse::Data::new_json(json!({
                        "error": format!("Stream error: {}", e),
                        "done": true
                    })) {
                        if tx
                            .send(sse::Event::Data(data.event("error")))
                            .await
                            .is_err()
                        {
                            send_failed = true;
                        }
                    } else if tx
                        .send(sse::Event::Comment(format!("stream_error:{}", e).into()))
                        .await
                        .is_err()
                    {
                        send_failed = true;
                    }

                    if tx
                        .send(sse::Event::Data(sse::Data::new("[DONE]")))
                        .await
                        .is_err()
                    {
                        send_failed = true;
                    }

                    if send_failed {
                        client_disconnected = true;
                    }
                    break;
                }
            }

            if client_disconnected || stream_failed {
                break;
            }
        }

        match processor_handle.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                log::error!("Stream processor returned error: {}", e);
                if !stream_failed {
                    stream_failed = true;
                    if let Some(message_id) = assistant_message_id {
                        if let Ok(Some(ctx)) =
                            session_manager.load_context(conversation_id, None).await
                        {
                            let updates = {
                                let mut ctx_lock = ctx.write().await;
                                ctx_lock.abort_streaming_response(
                                    message_id,
                                    format!("stream processor task failed: {}", e),
                                )
                            };

                            for update in updates {
                                if send_context_update(&tx, &update).await.is_err() {
                                    log::warn!(
                                        "Client disconnected while sending processor failure update"
                                    );
                                    client_disconnected = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Stream processor task panicked: {}", e);
                if !stream_failed {
                    stream_failed = true;
                    if let Some(message_id) = assistant_message_id {
                        if let Ok(Some(ctx)) =
                            session_manager.load_context(conversation_id, None).await
                        {
                            let updates = {
                                let mut ctx_lock = ctx.write().await;
                                ctx_lock.abort_streaming_response(
                                    message_id,
                                    format!("stream processor task panicked: {}", e),
                                )
                            };

                            for update in updates {
                                if send_context_update(&tx, &update).await.is_err() {
                                    log::warn!(
                                        "Client disconnected while sending processor failure update"
                                    );
                                    client_disconnected = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if client_disconnected {
            log::info!("Client disconnected, stopping stream processing early");
            return;
        }

        if stream_failed {
            log::warn!("Stream failed before completion; aborting without final updates");
            return;
        }

        let has_tool_calls = tool_accumulator.has_tool_calls();

        if let Some(message_id) = assistant_message_id {
            // Only finalize as purely text if NO tool calls are present
            // If tool calls exist, we'll handle finalization in the tool block below
            if !has_tool_calls {
                if let Ok(Some(ctx)) = session_manager.load_context(conversation_id, None).await {
                    let final_sequence = {
                        let mut ctx_lock = ctx.write().await;
                        ctx_lock.handle_event(ChatEvent::LLMStreamEnded);
                        // Use new API
                        ctx_lock.finalize_streaming_response(
                            message_id,
                            Some("complete".to_string()),
                            None,
                        );
                        ctx_lock
                            .message_sequence(message_id)
                            .unwrap_or(last_sequence)
                    };

                    if let Err(_) = send_content_signal(
                        &tx,
                        "content_final",
                        conversation_id,
                        message_id,
                        final_sequence,
                        true,
                    )
                    .await
                    {
                        return;
                    }
                }
            }
        }

        // Process accumulated tool calls
        if tool_accumulator.has_tool_calls() {
            let tool_calls = tool_accumulator.into_tool_calls();
            log::info!("Stream completed with {} tool call(s)", tool_calls.len());
            
            // Convert to ToolCallRequest format
            let tool_call_requests: Vec<context_manager::ToolCallRequest> = tool_calls
                .iter()
                .map(|call| {
                    let arguments_json: serde_json::Value = serde_json::from_str(&call.function.arguments)
                        .unwrap_or_else(|e| {
                            log::error!("Failed to parse tool arguments as JSON: {}, using raw string", e);
                            serde_json::Value::String(call.function.arguments.clone())
                        });
                    
                    context_manager::ToolCallRequest {
                        id: call.id.clone(),
                        tool_name: call.function.name.clone(),
                        arguments: tool_system::types::ToolArguments::Json(arguments_json),
                        approval_status: context_manager::ApprovalStatus::Pending,
                        display_preference: context_manager::DisplayPreference::Default,
                        ui_hints: None,
                    }
                })
                .collect();
            
            // Add tool calls to context if we have a message_id
            if let Some(message_id) = assistant_message_id {
                if let Ok(Some(ctx)) = session_manager.load_context(conversation_id, None).await {
                    let mut ctx_lock = ctx.write().await;
                    
                    // Update the streaming message to include tool calls
                    if let Some(node) = ctx_lock.message_pool.get_mut(&message_id) {
                        node.message.tool_calls = Some(tool_call_requests.clone());
                        log::info!("  Added {} tool calls to message {}", tool_call_requests.len(), message_id);
                    }
                    
                    // Finalize streaming with tool_calls finish reason
                    ctx_lock.finalize_streaming_response(
                        message_id,
                        Some("tool_calls".to_string()),
                        None,
                    );
                    
                    // Transition FSM
                    ctx_lock.handle_event(context_manager::ChatEvent::LLMFullResponseReceived);
                    ctx_lock.handle_event(context_manager::ChatEvent::LLMResponseProcessed {
                        has_tool_calls: true,
                    });

                    // Broadcast MessageUpdate::Completed so frontend gets the tool calls in the message
                    if let Some(node) = ctx_lock.message_pool.get(&message_id) {
                        let final_message = node.message.clone();
                        let update = ContextUpdate {
                            context_id: conversation_id,
                            current_state: ctx_lock.current_state.clone(),
                            previous_state: None,
                            message_update: Some(MessageUpdate::Completed {
                                message_id,
                                final_message,
                            }),
                            timestamp: Utc::now(),
                            metadata: HashMap::new(),
                        };
                        
                        // We use tx directly here (inline SSE)
                        let _ = send_context_update(&tx, &update).await;
                        log::info!("  Broadcasted MessageUpdate::Completed for message {}", message_id);
                    }
                }
            }
            
            // Send tool_approval SSE event to frontend
            let tool_call_ids: Vec<String> = tool_call_requests.iter().map(|tc| tc.id.clone()).collect();
            if let Ok(data) = sse::Data::new_json(json!({
                "type": "tool_approval",
                "tool_calls": tool_call_ids,
            })) {
                let _ = tx.send(sse::Event::Data(data.event("tool_approval"))).await;
                log::info!("Sent tool_approval SSE event for {} tool(s)", tool_call_ids.len());
            }
        }

        if !full_text.is_empty() {
            let handler = ToolAutoLoopHandler::new(
                session_manager.clone(),
                agent_service.clone(),
                tool_executor.clone(),
                approval_manager.clone(),
                conversation_id,
                tx.clone(),
            );

            handler
                .handle_full_text(&full_text, assistant_message_id, last_sequence)
                .await;
        }

        if let Ok(data) = sse::Data::new_json(json!({
            "done": true
        })) {
            let _ = tx.send(sse::Event::Data(data.event("done"))).await;
        }
        let _ = tx.send(sse::Event::Data(sse::Data::new("[DONE]"))).await;
    })
}
