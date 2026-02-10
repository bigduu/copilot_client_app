use actix_web::http::header;
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::state::{spawn_sse_sender, AppState};
use agent_loop::{run_agent_loop_with_config, AgentLoopConfig};

pub async fn handler(
    state: web::Data<AppState>,
    path: web::Path<String>,
    _req: HttpRequest,
) -> impl Responder {
    let session_id = path.into_inner();
    log::info!("[{}] Stream started", session_id);

    let session = {
        let sessions = state.sessions.read().await;
        sessions.get(&session_id).cloned()
    };

    let session = match session {
        Some(session) => session,
        None => match state.storage.load_session(&session_id).await {
            Ok(Some(session)) => {
                {
                    let mut sessions = state.sessions.write().await;
                    sessions.insert(session_id.clone(), session.clone());
                }
                session
            }
            Ok(None) => {
                log::warn!("[{}] Session not found", session_id);
                return HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Session not found",
                    "session_id": session_id
                }));
            }
            Err(e) => {
                log::error!("[{}] Failed to load session: {}", session_id, e);
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to load session: {}", e)
                }));
            }
        },
    };

    // Create SSE stream
    let (sse_tx, mut sse_rx) = mpsc::channel::<actix_web::web::Bytes>(100);

    // Create Agent event channel
    let (event_tx, event_rx) = mpsc::channel::<agent_core::AgentEvent>(100);

    // Wrap spawn_sse_sender to add debug logging
    let (debug_event_tx, mut debug_event_rx) = mpsc::channel::<agent_core::AgentEvent>(100);

    // Start event forwarding task
    let _event_stats = tokio::spawn({
        let session_id = session_id.clone();
        async move {
            let mut event_count = 0;
            let mut token_count = 0;

            while let Some(event) = debug_event_rx.recv().await {
                event_count += 1;

                match &event {
                    agent_core::AgentEvent::Token { .. } => {
                        token_count += 1;
                    }
                    agent_core::AgentEvent::Complete { usage } => {
                        log::info!(
                            "[{}] Stream completed: {} events, {} tokens",
                            session_id, event_count, usage.total_tokens
                        );
                    }
                    agent_core::AgentEvent::Error { message } => {
                        log::error!("[{}] Stream error: {}", session_id, message);
                    }
                    _ => {}
                }

                // Forward to SSE sender
                if event_tx.send(event).await.is_err() {
                    break;
                }
            }

            (event_count, token_count)
        }
    });

    // Start SSE sender
    let _sse_handle = spawn_sse_sender(event_rx, sse_tx);

    // Create cancellation token
    let cancel_token = CancellationToken::new();
    {
        let mut tokens = state.cancel_tokens.write().await;
        tokens.insert(session_id.clone(), cancel_token.clone());
    }

    // Run Agent Loop in background
    let state_clone = state.get_ref().clone();
    let session_id_clone = session_id.clone();

    tokio::spawn(async move {
        let mut session = session;

        // Get initial message (find last user message from session history)
        let initial_message = session
            .messages
            .last()
            .filter(|m| matches!(m.role, agent_core::agent::Role::User))
            .map(|m| m.content.clone())
            .unwrap_or_default();

        if !initial_message.is_empty() {
            let system_prompt = session
                .messages
                .iter()
                .find(|m| matches!(m.role, agent_core::agent::Role::System))
                .map(|m| m.content.clone());

            if let Some(prompt) = system_prompt.as_ref() {
                println!("\n========== SYSTEM PROMPT ==========");
                println!("Session: {}", session_id_clone);
                println!("Session has stored prompt: true");
                println!("Final prompt length: {} chars", prompt.len());
                println!("-----------------------------------");
                println!("{}", prompt);
                println!("========== END SYSTEM PROMPT ==========\n");
                log::info!(
                    "[{}] Using stored system prompt (length: {} chars)",
                    session_id_clone,
                    prompt.len(),
                );
            } else {
                log::warn!(
                    "[{}] Session has no stored system prompt; running without prompt override",
                    session_id_clone
                );
            }

            // Get all tool schemas (including skill-associated)
            let all_tool_schemas = state_clone.get_all_tool_schemas();

            // Run Agent Loop
            // Note: Initial user message was already added in chat.rs handler, skip here
            let storage: Arc<dyn agent_core::storage::Storage> = Arc::new(state_clone.storage.clone());
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
                    skill_manager: Some(state_clone.skill_manager.clone()),
                    skip_initial_user_message: true, // Message already in session
                    storage: Some(storage),
                    ..Default::default()
                },
            )
            .await;

            if let Err(e) = &result {
                log::error!("[{}] Agent Loop error: {}", session_id_clone, e);
                let _ = debug_event_tx
                    .send(agent_core::AgentEvent::Error {
                        message: e.to_string(),
                    })
                    .await;
            }
        }

        // Close event channel
        drop(debug_event_tx);

        // Save session
        state_clone.save_session(&session).await;

        // Update session in memory
        {
            let mut sessions = state_clone.sessions.write().await;
            sessions.insert(session_id_clone.clone(), session);
        }

        // Remove cancellation token
        {
            let mut tokens = state_clone.cancel_tokens.write().await;
            tokens.remove(&session_id_clone);
        }
    });

    // Return SSE response
    HttpResponse::Ok()
        .append_header((header::CONTENT_TYPE, "text/event-stream"))
        .append_header((header::CACHE_CONTROL, "no-cache"))
        .append_header((header::CONNECTION, "keep-alive"))
        .streaming(async_stream::stream! {
            while let Some(item) = sse_rx.recv().await {
                yield Ok::<_, actix_web::Error>(item);
            }
        })
}

// Implement Clone for AppState (for passing between threads)
impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            sessions: self.sessions.clone(),
            storage: self.storage.clone(),
            llm: self.llm.clone(),
            tools: self.tools.clone(),
            cancel_tokens: self.cancel_tokens.clone(),
            skill_manager: self.skill_manager.clone(),
            mcp_manager: self.mcp_manager.clone(),
        }
    }
}
