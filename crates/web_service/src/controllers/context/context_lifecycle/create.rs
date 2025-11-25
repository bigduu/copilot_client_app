//! Context creation operations

use super::types::{CreateContextRequest, CreateContextResponse};
use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    post,
    web::{Data, Json},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use tracing;

/// Create a new chat context
#[post("/contexts")]
pub async fn create_context(
    app_state: Data<AppState>,
    req: Json<CreateContextRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let trace_id = extract_trace_id(&http_req);
    tracing::debug!(
        trace_id = ?trace_id,
        model_id = %req.model_id,
        mode = %req.mode,
        system_prompt_id = ?req.system_prompt_id,
        "create_context endpoint called"
    );

    match app_state
        .session_manager
        .create_session(req.model_id.clone(), req.mode.clone(), trace_id.clone())
        .await
    {
        Ok(session) => {
            // Get the ID first, then handle system_prompt in a single write lock
            let session_id = {
                let mut session_guard = session.write().await;
                let id = session_guard.id;

                // If system_prompt_id is provided, attach it to the context config
                if let Some(system_prompt_id) = &req.system_prompt_id {
                    tracing::debug!(
                        trace_id = ?trace_id,
                        context_id = %id,
                        system_prompt_id = %system_prompt_id,
                        "Attaching system prompt to context"
                    );
                    session_guard.config.system_prompt_id = Some(system_prompt_id.clone());
                    session_guard.mark_dirty();

                    app_state
                        .session_manager
                        .save_context(&mut *session_guard)
                        .await
                        .map_err(|e| {
                            error!("Failed to save context with system prompt: {}", e);
                            actix_web::error::ErrorInternalServerError("Failed to save context")
                        })?;
                }

                if let Some(workspace_path) = &req.workspace_path {
                    tracing::debug!(
                        trace_id = ?trace_id,
                        context_id = %id,
                        workspace_path = %workspace_path,
                        "Attaching workspace path to context"
                    );
                    session_guard.set_workspace_path(Some(workspace_path.clone()));

                    app_state
                        .session_manager
                        .save_context(&mut *session_guard)
                        .await
                        .map_err(|e| {
                            error!("Failed to save context with workspace path: {}", e);
                            actix_web::error::ErrorInternalServerError("Failed to save context")
                        })?;
                }

                id
            }; // Lock is dropped here

            tracing::info!(
                trace_id = ?trace_id,
                context_id = %session_id,
                "Context created successfully"
            );

            info!("Created new chat context: {}", session_id);
            Ok(HttpResponse::Ok().json(CreateContextResponse {
                id: session_id.to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to create context: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create context: {}", e)
            })))
        }
    }
}
