//! Context update operations

use super::types::UpdateContextConfigRequest;
use crate::{dto::ChatContextDTO, middleware::extract_trace_id, server::AppState};
use actix_web::{
    patch, put,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use tracing;
use uuid::Uuid;

/// Update context configuration (auto_generate_title, mermaid_diagrams)
#[patch("/contexts/{id}/config")]
pub async fn update_context_config(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<UpdateContextConfigRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::info!(
        context_id = %context_id,
        auto_generate_title = ?req.auto_generate_title,
        mermaid_diagrams = ?req.mermaid_diagrams,
        "Updating context configuration"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            // Update configuration in a write lock
            {
                let mut ctx = context.write().await;

                if let Some(auto_generate) = req.auto_generate_title {
                    ctx.auto_generate_title = auto_generate;
                    ctx.mark_dirty(); // Trigger auto-save
                }

                if let Some(mermaid_enabled) = req.mermaid_diagrams {
                    ctx.config.mermaid_diagrams = mermaid_enabled;
                    ctx.mark_dirty(); // Trigger auto-save
                }
            }

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Context configuration updated successfully"
            })))
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!(
                "Failed to load context {} for config update: {}",
                context_id, err
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}

/// Update a context (currently only supports updating system_prompt_id)
#[put("/contexts/{id}")]
pub async fn update_context(
    path: Path<Uuid>,
    req: Json<ChatContextDTO>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    // For now, we only support updating the system prompt ID
    // Full context updates would require deserializing and merging which is complex
    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            // Update and save in a single write lock scope
            let result = {
                let mut ctx_guard = context.write().await;
                ctx_guard.config.system_prompt_id = req.config.system_prompt_id.clone();
                ctx_guard.mark_dirty();
                app_state
                    .session_manager
                    .save_context(&mut *ctx_guard)
                    .await
            }; // Lock released here

            match result {
                Ok(_) => {
                    info!("Updated context: {}", context_id);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "message": "Context updated successfully"
                    })))
                }
                Err(e) => {
                    error!("Failed to save context: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to save context: {}", e)
                    })))
                }
            }
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(e) => {
            error!("Failed to load context for update: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}
