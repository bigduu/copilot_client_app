use actix_web::{web, HttpResponse, Responder};
use chrono::Utc;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::state::{AgentRunner, AgentStatus, AppState};
use agent_core::agent::Role;
use agent_loop::{run_agent_loop_with_config, AgentLoopConfig};

#[derive(Serialize)]
pub struct ExecuteResponse {
    pub session_id: String,
    pub status: String,
    pub events_url: String,
}

pub async fn handler(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let session_id = path.into_inner();
    log::debug!("[{}] Execute request received", session_id);

    // Check if there's already a runner for this session
    {
        let runners = state.agent_runners.read().await;
        if let Some(runner) = runners.get(&session_id) {
            let status_str = match &runner.status {
                AgentStatus::Running => "already_running",
                AgentStatus::Completed => "completed",
                AgentStatus::Cancelled => "cancelled",
                AgentStatus::Error(_) => "error",
                AgentStatus::Pending => "pending",
            };

            log::debug!("[{}] Returning existing runner status: {}", session_id, status_str);

            return HttpResponse::Ok().json(ExecuteResponse {
                session_id: session_id.clone(),
                status: status_str.to_string(),
                events_url: format!("/api/v1/events/{}", session_id),
            });
        }
    }

    // Load session from memory or storage
    let mut session = {
        let sessions = state.sessions.read().await;
        sessions.get(&session_id).cloned()
    };

    if session.is_none() {
        match state.storage.load_session(&session_id).await {
            Ok(Some(s)) => session = Some(s),
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
        }
    }

    let mut session = session.unwrap();

    // Check if there's a pending user message
    let last_message_is_user = session
        .messages
        .last()
        .map(|m| matches!(m.role, Role::User))
        .unwrap_or(false);

    if !last_message_is_user {
        log::debug!("[{}] No pending user message, returning completed status", session_id);
        return HttpResponse::Ok().json(ExecuteResponse {
            session_id: session_id.clone(),
            status: "completed".to_string(),
            events_url: format!("/api/v1/events/{}", session_id),
        });
    }

    // Create runner
    let mut runner = AgentRunner::new();
    runner.status = AgentStatus::Running;
    let broadcast_tx = runner.event_sender.clone();
    let cancel_token = runner.cancel_token.clone();

    {
        let mut runners = state.agent_runners.write().await;
        runners.insert(session_id.clone(), runner);
    }

    log::info!("[{}] Starting agent execution", session_id);

    // Create mpsc channel for agent loop
    let (mpsc_tx, mut mpsc_rx) = mpsc::channel::<agent_core::AgentEvent>(100);

    // Start agent loop in background
    let state_clone = state.get_ref().clone();
    let session_id_clone = session_id.clone();

    // Spawn event forwarder: mpsc -> broadcast
    let session_id_forwarder = session_id.clone();
    tokio::spawn(async move {
        while let Some(event) = mpsc_rx.recv().await {
            if broadcast_tx.send(event.clone()).is_err() {
                log::debug!("[{}] No subscribers for event", session_id_forwarder);
            }
        }
        log::debug!("[{}] Event forwarder finished", session_id_forwarder);
    });

    // Spawn agent loop
    tokio::spawn(async move {
        // Get system prompt
        let system_prompt = session
            .messages
            .iter()
            .find(|m| matches!(m.role, Role::System))
            .map(|m| m.content.clone());

        // Get initial user message
        let initial_message = session
            .messages
            .last()
            .filter(|m| matches!(m.role, Role::User))
            .map(|m| m.content.clone())
            .unwrap_or_default();

        // Get all tool schemas
        let all_tool_schemas = state_clone.get_all_tool_schemas();

        // Get model from session or use state default
        let model_name = session
            .model
            .clone()
            .unwrap_or_else(|| state_clone.model_name.clone());

        if let Some(prompt) = system_prompt.as_ref() {
            println!("\n========== SYSTEM PROMPT ==========");
            println!("Session: {}", session_id_clone);
            println!("Final prompt length: {} chars", prompt.len());
            println!("-----------------------------------");
            println!("{}", prompt);
            println!("========== END SYSTEM PROMPT ==========\n");
        }

        // Run agent loop
        let storage: Arc<dyn agent_core::storage::Storage> =
            Arc::new(state_clone.storage.clone());

        let result = run_agent_loop_with_config(
            &mut session,
            initial_message,
            mpsc_tx.clone(),
            state_clone.llm.clone(),
            state_clone.tools.clone(),
            cancel_token,
            AgentLoopConfig {
                max_rounds: 50,
                system_prompt,
                additional_tool_schemas: all_tool_schemas,
                skill_manager: Some(state_clone.skill_manager.clone()),
                skip_initial_user_message: true,
                storage: Some(storage),
                metrics_collector: Some(state_clone.metrics_service.collector()),
                model_name: Some(model_name),
                ..Default::default()
            },
        )
        .await;

        // Send terminal event if error
        if let Err(ref e) = result {
            if !e.to_string().contains("cancelled") {
                let _ = mpsc_tx.send(agent_core::AgentEvent::Error {
                    message: e.to_string(),
                }).await;
            }
        }

        // Update runner status
        {
            let mut runners = state_clone.agent_runners.write().await;
            if let Some(runner) = runners.get_mut(&session_id_clone) {
                runner.status = match result {
                    Ok(_) => AgentStatus::Completed,
                    Err(e) if e.to_string().contains("cancelled") => AgentStatus::Cancelled,
                    Err(e) => AgentStatus::Error(e.to_string()),
                };
                runner.completed_at = Some(Utc::now());
            }
        }

        // Save session
        state_clone.save_session(&session).await;

        // Update memory
        {
            let mut sessions = state_clone.sessions.write().await;
            sessions.insert(session_id_clone.clone(), session);
        }

        // Remove cancellation token (legacy)
        {
            let mut tokens = state_clone.cancel_tokens.write().await;
            tokens.remove(&session_id_clone);
        }

        log::info!("[{}] Agent execution completed", session_id_clone);
    });

    HttpResponse::Accepted().json(ExecuteResponse {
        session_id: session_id.clone(),
        status: "started".to_string(),
        events_url: format!("/api/v1/events/{}", session_id),
    })
}
