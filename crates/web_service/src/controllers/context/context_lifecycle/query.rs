//! Context query operations

use super::types::{ConfigSummary, ContextMetadataResponse, ContextSummary, ListContextsResponse};
use crate::{dto::ChatContextDTO, middleware::extract_trace_id, server::AppState};
use actix_web::{
    get,
    web::{Data, Path},
    HttpRequest, HttpResponse, Result,
};
use log::error;
use tracing;
use uuid::Uuid;

/// Get a specific context by ID
#[get("/contexts/{id}")]
pub async fn get_context(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "get_context endpoint called"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            // Create DTO in a short-lived read lock
            let dto = {
                let ctx = context.read().await;
                tracing::debug!(
                    trace_id = ?trace_id,
                    context_id = %context_id,
                    state = ?ctx.current_state,
                    message_count = ctx.message_pool.len(),
                    "Context loaded successfully"
                );
                ChatContextDTO::from(ctx.clone())
            }; // Lock released here

            Ok(HttpResponse::Ok().json(dto))
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
                "Failed to load context"
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

/// List all contexts
#[get("/contexts")]
pub async fn list_contexts(
    app_state: Data<AppState>,
    _http_req: HttpRequest,
) -> Result<HttpResponse> {
    // Simplified version - just return IDs without loading full contexts
    match app_state.session_manager.list_contexts().await {
        Ok(context_ids) => {
            let mut summaries: Vec<ContextSummary> = Vec::new();

            for id in context_ids {
                let summary = if let Ok(Some(context)) =
                    app_state.session_manager.load_context(id, None).await
                {
                    let ctx = context.read().await;
                    ContextSummary {
                        id: ctx.id.to_string(),
                        config: ConfigSummary {
                            model_id: ctx.config.model_id.clone(),
                            mode: ctx.config.mode.clone(),
                            system_prompt_id: ctx.config.system_prompt_id.clone(),
                            workspace_path: ctx.config.workspace_path.clone(),
                        },
                        current_state: format!("{:?}", ctx.current_state),
                        active_branch_name: ctx.active_branch_name.clone(),
                        message_count: ctx.message_pool.len(),
                        title: ctx.title.clone(),
                        auto_generate_title: ctx.auto_generate_title,
                    }
                } else {
                    ContextSummary {
                        id: id.to_string(),
                        config: ConfigSummary {
                            model_id: "gpt-4".to_string(),
                            mode: "chat".to_string(),
                            system_prompt_id: None,
                            workspace_path: None,
                        },
                        current_state: "Unknown".to_string(),
                        active_branch_name: "main".to_string(),
                        message_count: 0,
                        title: None,
                        auto_generate_title: true,
                    }
                };

                summaries.push(summary);
            }

            Ok(HttpResponse::Ok().json(ListContextsResponse {
                contexts: summaries,
            }))
        }
        Err(e) => {
            error!("Failed to list contexts: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list contexts: {}", e)
            })))
        }
    }
}

/// Get lightweight context metadata (for Signal-Pull architecture)
#[get("/contexts/{id}/metadata")]
pub async fn get_context_metadata(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "get_context_metadata endpoint called"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let metadata = {
                let ctx = context.read().await;
                ContextMetadataResponse {
                    id: ctx.id.to_string(),
                    current_state: format!("{:?}", ctx.current_state),
                    active_branch_name: ctx.active_branch_name.clone(),
                    message_count: ctx.message_pool.len(),
                    model_id: ctx.config.model_id.clone(),
                    mode: ctx.config.mode.clone(),
                    system_prompt_id: ctx.config.system_prompt_id.clone(),
                    workspace_path: ctx.config.workspace_path.clone(),
                    title: ctx.title.clone(),
                    auto_generate_title: ctx.auto_generate_title,
                    mermaid_diagrams: ctx.config.mermaid_diagrams,
                }
            };

            Ok(HttpResponse::Ok().json(metadata))
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
                "Failed to load context metadata"
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}
