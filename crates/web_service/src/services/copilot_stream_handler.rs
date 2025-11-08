use std::sync::Arc;

use actix_web_lab::sse;
use bytes::Bytes;
use context_manager::ChatEvent;
use serde_json::json;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tool_system::ToolExecutor;
use uuid::Uuid;

use crate::services::agent_service::AgentService;
use crate::services::approval_manager::ApprovalManager;
use crate::services::llm_utils::send_context_update;
use crate::services::session_manager::ChatSessionManager;
use crate::services::tool_auto_loop_handler::{send_content_signal, ToolAutoLoopHandler};
use crate::storage::StorageProvider;

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
                                if let Some(content) = &choice.delta.content {
                                    let content_str = content.clone();
                                    full_text.push_str(&content_str);

                                    if !stream_started {
                                        stream_started = true;
                                        if let Ok(Some(ctx)) = session_manager
                                            .load_context(conversation_id, None)
                                            .await
                                        {
                                            let (message_id, initial_updates) = {
                                                let mut ctx_lock = ctx.write().await;
                                                // begin_streaming_response already handles state transition
                                                // to StreamingLLMResponse, no need for manual handle_event
                                                ctx_lock.begin_streaming_response()
                                            };
                                            assistant_message_id = Some(message_id);
                                            for update in initial_updates {
                                                let mut sanitized = update.clone();
                                                sanitized.message_update = None;
                                                if send_context_update(&tx, &sanitized)
                                                    .await
                                                    .is_err()
                                                {
                                                    log::warn!(
                                                        "Client disconnected while streaming context update"
                                                    );
                                                    client_disconnected = true;
                                                    break;
                                                }
                                            }
                                            if client_disconnected {
                                                break;
                                            }
                                        }
                                    }

                                    if let Some(message_id) = assistant_message_id {
                                        if let Ok(Some(ctx)) = session_manager
                                            .load_context(conversation_id, None)
                                            .await
                                        {
                                            let update_opt = {
                                                let mut ctx_lock = ctx.write().await;
                                                let update = ctx_lock.apply_streaming_delta(
                                                    message_id,
                                                    content_str.clone(),
                                                );
                                                ctx_lock.handle_event(
                                                    ChatEvent::LLMStreamChunkReceived,
                                                );
                                                update
                                            };
                                            if let Some((update, sequence)) = update_opt {
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

                                                let mut sanitized = update;
                                                sanitized.message_update = None;
                                                if send_context_update(&tx, &sanitized)
                                                    .await
                                                    .is_err()
                                                {
                                                    log::warn!(
                                                        "Client disconnected while streaming context update"
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

        if let Some(message_id) = assistant_message_id {
            if let Ok(Some(ctx)) = session_manager.load_context(conversation_id, None).await {
                let (final_updates, final_sequence) = {
                    let mut ctx_lock = ctx.write().await;
                    ctx_lock.handle_event(ChatEvent::LLMStreamEnded);
                    let updates = ctx_lock.finish_streaming_response(message_id);
                    let sequence = ctx_lock
                        .message_sequence(message_id)
                        .unwrap_or(last_sequence);
                    (updates, sequence)
                };

                for update in final_updates {
                    let mut sanitized = update.clone();
                    sanitized.message_update = None;

                    if send_context_update(&tx, &sanitized).await.is_err() {
                        log::warn!("Client disconnected while sending final streaming update");
                        return;
                    }
                }

                let final_seq = if final_sequence == 0 {
                    last_sequence
                } else {
                    final_sequence
                };

                if let Err(_) = send_content_signal(
                    &tx,
                    "content_final",
                    conversation_id,
                    message_id,
                    final_seq,
                    true,
                )
                .await
                {
                    return;
                }
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
