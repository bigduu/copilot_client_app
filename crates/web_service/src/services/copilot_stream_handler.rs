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
use crate::services::llm_utils::{detect_message_type, send_context_update};
use crate::services::session_manager::ChatSessionManager;
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
                                                let result = ctx_lock.begin_streaming_response();
                                                ctx_lock.handle_event(ChatEvent::LLMStreamStarted);
                                                result
                                            };
                                            assistant_message_id = Some(message_id);
                                            for update in initial_updates {
                                                if send_context_update(&tx, &update).await.is_err()
                                                {
                                                    log::warn!(
                                                        "Client disconnected while sending initial streaming update"
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
                                            if let Some(update) = update_opt {
                                                if send_context_update(&tx, &update).await.is_err()
                                                {
                                                    log::warn!(
                                                        "Client disconnected while streaming delta"
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
                let final_updates = {
                    let mut ctx_lock = ctx.write().await;
                    ctx_lock.handle_event(ChatEvent::LLMStreamEnded);
                    ctx_lock.finish_streaming_response(message_id)
                };

                for update in final_updates {
                    if send_context_update(&tx, &update).await.is_err() {
                        log::warn!("Client disconnected while sending final streaming update");
                        return;
                    }
                }
            }
        }

        if !full_text.is_empty() {
            let tool_call_opt = agent_service
                .parse_tool_call_from_response(&full_text)
                .ok()
                .flatten();

            let mut has_tool_calls = false;

            if let Some(tool_call) = tool_call_opt.clone() {
                let validation_result = agent_service.validate_tool_call(&tool_call);

                match validation_result {
                    Ok(_) => {
                        let tool_def = tool_executor.get_tool_definition(&tool_call.tool);
                        let (requires_approval, tool_description) = match &tool_def {
                            Some(def) => (def.requires_approval, def.description.clone()),
                            None => (false, String::new()),
                        };

                        if requires_approval {
                            has_tool_calls = true;

                            match approval_manager
                                .create_request(
                                    conversation_id,
                                    tool_call.clone(),
                                    tool_call.tool.clone(),
                                    tool_description.clone(),
                                )
                                .await
                            {
                                Ok(request_id) => {
                                    if let Ok(Some(ctx)) =
                                        session_manager.load_context(conversation_id, None).await
                                    {
                                        let update = {
                                            let mut ctx_lock = ctx.write().await;
                                            ctx_lock.record_tool_approval_request(
                                                request_id,
                                                &tool_call.tool,
                                            )
                                        };

                                        if send_context_update(&tx, &update).await.is_err() {
                                            log::warn!(
                                                "Client disconnected while sending approval update"
                                            );
                                        }
                                    }

                                    if let Ok(data) = sse::Data::new_json(json!({
                                        "type": "approval_required",
                                        "request_id": request_id,
                                        "session_id": conversation_id,
                                        "tool": tool_call.tool,
                                        "tool_description": tool_description,
                                        "parameters": tool_call.parameters,
                                        "done": true
                                    })) {
                                        let _ = tx
                                            .send(sse::Event::Data(data.event("approval_required")))
                                            .await;
                                    }
                                }
                                Err(e) => {
                                    let error_msg =
                                        format!("Failed to create approval request: {}", e);
                                    if let Ok(data) = sse::Data::new_json(
                                        json!({"error": error_msg, "done": true}),
                                    ) {
                                        let _ =
                                            tx.send(sse::Event::Data(data.event("error"))).await;
                                    }
                                }
                            }
                        } else {
                            use tool_system::types::ToolArguments;
                            let tool_name = tool_call.tool.clone();
                            let tool_params = tool_call.parameters.clone();

                            if let Ok(Some(ctx)) =
                                session_manager.load_context(conversation_id, None).await
                            {
                                let update = {
                                    let mut ctx_lock = ctx.write().await;
                                    ctx_lock.begin_tool_execution(&tool_name, 1, None)
                                };
                                if send_context_update(&tx, &update).await.is_err() {
                                    log::warn!(
                                        "Client disconnected while sending execution start update"
                                    );
                                }
                            }

                            match tool_executor
                                .execute_tool(&tool_name, ToolArguments::Json(tool_params))
                                .await
                            {
                                Ok(result) => {
                                    if let Ok(Some(ctx)) =
                                        session_manager.load_context(conversation_id, None).await
                                    {
                                        let update = {
                                            let mut ctx_lock = ctx.write().await;
                                            ctx_lock.complete_tool_execution()
                                        };
                                        if send_context_update(&tx, &update).await.is_err() {
                                            log::warn!(
                                                "Client disconnected while sending execution completion update"
                                            );
                                        }
                                    }

                                    if let Ok(data) = sse::Data::new_json(json!({
                                        "type": "tool_result",
                                        "tool": tool_name,
                                        "result": result,
                                        "done": false
                                    })) {
                                        let _ = tx
                                            .send(sse::Event::Data(data.event("tool_result")))
                                            .await;
                                    }
                                }
                                Err(e) => {
                                    if let Ok(Some(ctx)) =
                                        session_manager.load_context(conversation_id, None).await
                                    {
                                        let update = {
                                            let mut ctx_lock = ctx.write().await;
                                            ctx_lock.record_tool_execution_failure(
                                                &tool_name,
                                                0,
                                                &e.to_string(),
                                                None,
                                            )
                                        };
                                        if send_context_update(&tx, &update).await.is_err() {
                                            log::warn!(
                                                "Client disconnected while sending execution failure update"
                                            );
                                        }
                                    }

                                    let error_msg = format!("Tool execution failed: {}", e);
                                    if let Ok(data) = sse::Data::new_json(json!({
                                        "error": error_msg,
                                        "done": false
                                    })) {
                                        let _ =
                                            tx.send(sse::Event::Data(data.event("error"))).await;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Tool call validation failed: {}", e);
                    }
                }
            }

            let message_type = detect_message_type(&full_text);

            if let Ok(Some(context)) = session_manager.load_context(conversation_id, None).await {
                let mut context_lock = context.write().await;

                if let Some(message_id) = assistant_message_id {
                    if let Some(node) = context_lock.message_pool.get_mut(&message_id) {
                        node.message.message_type = message_type;
                    }
                }

                context_lock.handle_event(ChatEvent::LLMResponseProcessed { has_tool_calls });

                if let Err(e) = session_manager.save_context(&mut *context_lock).await {
                    log::error!("Failed to save context after streaming: {}", e);
                }
            }
        }

        if let Ok(data) = sse::Data::new_json(json!({
            "content": "",
            "done": true
        })) {
            let _ = tx.send(sse::Event::Data(data.event("done"))).await;
        }
        let _ = tx.send(sse::Event::Data(sse::Data::new("[DONE]"))).await;
    })
}
