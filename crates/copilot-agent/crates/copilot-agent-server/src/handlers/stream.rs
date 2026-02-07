use actix_web::http::header;
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use std::time::Instant;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::agent_runner::{run_agent_loop_with_config, AgentLoopConfig};
use crate::logging::DebugLogger;
use crate::state::{spawn_sse_sender, AppState};

pub async fn handler(
    state: web::Data<AppState>,
    path: web::Path<String>,
    _req: HttpRequest,
) -> impl Responder {
    let session_id = path.into_inner();
    let start_time = Instant::now();
    DebugLogger::new(log::log_enabled!(log::Level::Debug));

    log::debug!("[{}] SSE stream request received", session_id);

    let session = {
        let sessions = state.sessions.read().await;
        sessions.get(&session_id).cloned()
    };

    let session = match session {
        Some(session) => {
            log::debug!(
                "[{}] Found existing session with {} messages",
                session_id,
                session.messages.len()
            );
            session
        }
        None => match state.storage.load_session(&session_id).await {
            Ok(Some(session)) => {
                log::debug!(
                    "[{}] Loaded session from storage with {} messages",
                    session_id,
                    session.messages.len()
                );
                {
                    let mut sessions = state.sessions.write().await;
                    sessions.insert(session_id.clone(), session.clone());
                }
                session
            }
            _ => {
                log::warn!("[{}] Session not found", session_id);
                return HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Session not found"
                }));
            }
        },
    };

    // 创建 SSE 流
    let (sse_tx, mut sse_rx) = mpsc::channel::<actix_web::web::Bytes>(100);

    // 创建 Agent 事件通道
    let (event_tx, event_rx) = mpsc::channel::<copilot_agent_core::AgentEvent>(100);

    // 包装 spawn_sse_sender 以添加 debug 日志
    let (debug_event_tx, mut debug_event_rx) = mpsc::channel::<copilot_agent_core::AgentEvent>(100);

    // 启动事件转发任务（用于统计和日志）
    let event_stats = tokio::spawn({
        let session_id = session_id.clone();
        async move {
            let mut event_count = 0;
            let mut token_count = 0;

            while let Some(event) = debug_event_rx.recv().await {
                event_count += 1;

                match &event {
                    copilot_agent_core::AgentEvent::Token { content } => {
                        token_count += content.len();
                        if event_count % 10 == 0 {
                            log::debug!(
                                "[{}] Sent {} events, {} tokens so far",
                                session_id,
                                event_count,
                                token_count
                            );
                        }
                    }
                    copilot_agent_core::AgentEvent::ToolStart { tool_name, .. } => {
                        log::debug!("[{}] SSE: ToolStart - {}", session_id, tool_name);
                    }
                    copilot_agent_core::AgentEvent::ToolComplete { result, .. } => {
                        log::debug!(
                            "[{}] SSE: ToolComplete - success: {}",
                            session_id,
                            result.success
                        );
                    }
                    copilot_agent_core::AgentEvent::Complete { usage } => {
                        log::debug!(
                            "[{}] SSE: Complete - total_tokens: {}",
                            session_id,
                            usage.total_tokens
                        );
                    }
                    copilot_agent_core::AgentEvent::Error { message } => {
                        log::error!("[{}] SSE: Error - {}", session_id, message);
                    }
                    _ => {}
                }

                // 转发到 SSE 发送器
                if event_tx.send(event).await.is_err() {
                    log::debug!("[{}] Event channel closed", session_id);
                    break;
                }
            }

            (event_count, token_count)
        }
    });

    // 启动 SSE 发送器
    let _sse_handle = spawn_sse_sender(event_rx, sse_tx);

    // 创建取消令牌
    let cancel_token = CancellationToken::new();
    {
        let mut tokens = state.cancel_tokens.write().await;
        tokens.insert(session_id.clone(), cancel_token.clone());
    }

    log::debug!("[{}] Starting Agent Loop in background", session_id);

    // 在后台运行 Agent Loop
    let state_clone = state.get_ref().clone();
    let session_id_clone = session_id.clone();

    tokio::spawn(async move {
        let mut session = session;

        // 获取初始消息（从会话历史中找最后一条用户消息）
        let initial_message = session
            .messages
            .last()
            .filter(|m| matches!(m.role, copilot_agent_core::agent::Role::User))
            .map(|m| m.content.clone())
            .unwrap_or_default();

        log::debug!(
            "[{}] Initial message for Agent Loop: {}",
            session_id_clone,
            initial_message
        );

        if !initial_message.is_empty() {
            let system_prompt = session
                .messages
                .iter()
                .find(|m| matches!(m.role, copilot_agent_core::agent::Role::System))
                .map(|m| m.content.clone());

            if let Some(prompt) = system_prompt.as_ref() {
                println!("\n========== SYSTEM PROMPT ==========");
                println!("Session: {}", session_id_clone);
                println!("Session has stored prompt: true");
                println!("Loaded skills count: {}", state_clone.loaded_skills.len());
                for (i, skill) in state_clone.loaded_skills.iter().enumerate() {
                    println!("  Skill {}: {} - {}", i + 1, skill.id, skill.name);
                }
                println!("Final prompt length: {} chars", prompt.len());
                println!("-----------------------------------");
                println!("{}", prompt);
                println!("========== END SYSTEM PROMPT ==========\n");
                log::info!(
                    "[{}] Using stored system prompt (length: {} chars, {} skills)",
                    session_id_clone,
                    prompt.len(),
                    state_clone.loaded_skills.len()
                );
            } else {
                log::warn!(
                    "[{}] Session has no stored system prompt; running without prompt override",
                    session_id_clone
                );
            }

            // 获取所有工具 schemas（包括 skill 关联的）
            let all_tool_schemas = state_clone.get_all_tool_schemas();

            // 运行 Agent Loop
            // 注意：初始用户消息已在 chat.rs handler 中添加，这里需要跳过
            let result = run_agent_loop_with_config(
                &mut session,
                initial_message,
                debug_event_tx.clone(),
                state_clone.llm.clone(),
                state_clone.tools.clone(),
                cancel_token,
                AgentLoopConfig {
                    max_rounds: 50,
                    system_prompt,
                    additional_tool_schemas: all_tool_schemas,
                    skip_initial_user_message: true, // 消息已在 session 中
                },
            )
            .await;

            if let Err(e) = &result {
                log::error!("[{}] Agent Loop error: {}", session_id_clone, e);
                let _ = debug_event_tx
                    .send(copilot_agent_core::AgentEvent::Error {
                        message: e.to_string(),
                    })
                    .await;
            } else {
                log::debug!("[{}] Agent Loop completed successfully", session_id_clone);
            }
        } else {
            log::warn!(
                "[{}] No initial message found for Agent Loop",
                session_id_clone
            );
        }

        // 关闭事件通道
        drop(debug_event_tx);

        // 保存会话
        log::debug!(
            "[{}] Saving session with {} messages",
            session_id_clone,
            session.messages.len()
        );
        state_clone.save_session(&session).await;

        // 更新内存中的会话
        {
            let mut sessions = state_clone.sessions.write().await;
            sessions.insert(session_id_clone.clone(), session);
        }

        // 移除取消令牌
        {
            let mut tokens = state_clone.cancel_tokens.write().await;
            tokens.remove(&session_id_clone);
        }

        log::debug!("[{}] Background task completed", session_id_clone);
    });

    // 等待统计任务完成并记录
    let session_id_for_stats = session_id.clone();
    tokio::spawn(async move {
        match event_stats.await {
            Ok((event_count, token_count)) => {
                let duration = start_time.elapsed();
                log::debug!(
                    "[{}] Stream completed: {} events, {} tokens, {:?} elapsed",
                    session_id_for_stats,
                    event_count,
                    token_count,
                    duration
                );
            }
            Err(e) => {
                log::error!("[{}] Event stats task failed: {}", session_id_for_stats, e);
            }
        }
    });

    // 返回 SSE 响应
    log::debug!("[{}] Returning SSE response", session_id);
    HttpResponse::Ok()
        .append_header((header::CONTENT_TYPE, "text/event-stream"))
        .append_header((header::CACHE_CONTROL, "no-cache"))
        .append_header((header::CONNECTION, "keep-alive"))
        .streaming(async_stream::stream! {
            while let Some(item) = sse_rx.recv().await {
                yield Ok::<_, actix_web::Error>(item);
            }
            log::debug!("[{}] SSE stream closed", session_id);
        })
}

// 为 AppState 实现 Clone（用于线程间传递）
impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            sessions: self.sessions.clone(),
            storage: self.storage.clone(),
            llm: self.llm.clone(),
            tools: self.tools.clone(),
            cancel_tokens: self.cancel_tokens.clone(),
            loaded_skills: self.loaded_skills.clone(),
        }
    }
}
