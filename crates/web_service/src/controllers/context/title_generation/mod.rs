//! Title generation domain
//!
//! Handles title generation for contexts:
//! - Manual title generation via API
//! - Automatic title generation after first AI response
//!
//! This module eliminates 90% code duplication by providing a unified
//! core implementation shared between manual and automatic generation.

pub mod generator;
pub mod helpers;
pub mod types;

// Re-export public types
pub use types::*;

use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    post,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::error;
use uuid::Uuid;

/// Generate a title for a context based on conversation history
#[post("/contexts/{id}/generate-title")]
pub async fn generate_context_title(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<GenerateTitleRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    let params = req.into_inner();

    // Build generation parameters
    let generation_params = types::TitleGenerationParams {
        max_length: params.max_length.unwrap_or(60).max(10),
        message_limit: params.message_limit.unwrap_or(6).max(1),
        fallback_title: params
            .fallback_title
            .unwrap_or_else(|| "New Chat".to_string()),
    };

    // Load context
    let context = match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(ctx)) => ctx,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(err) => {
            error!(
                "Failed to load context {} for title generation: {}",
                context_id, err
            );
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })));
        }
    };

    // Generate title (core logic - no duplication!)
    match generator::generate_title(&app_state, &context, context_id, generation_params).await {
        Ok(title) => Ok(HttpResponse::Ok().json(GenerateTitleResponse { title })),
        Err(err) => {
            error!(
                "Failed to generate title for context {}: {}",
                context_id, err
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to generate title"
            })))
        }
    }
}

/// Auto-generate title if needed (called after first AI response)
///
/// This function shares the same core logic as manual generation,
/// eliminating the previous 90% code duplication.
pub async fn auto_generate_title_if_needed(
    app_state: &AppState,
    context_id: Uuid,
    trace_id: Option<String>,
) {
    // Load context
    let context = match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(ctx)) => ctx,
        Ok(None) => {
            tracing::warn!(
                context_id = %context_id,
                "Context not found for auto title generation"
            );
            return;
        }
        Err(err) => {
            tracing::error!(
                context_id = %context_id,
                error = %err,
                "Failed to load context for auto title generation"
            );
            return;
        }
    };

    // Check if auto-generation is needed
    let should_generate = {
        let ctx = context.read().await;
        ctx.auto_generate_title
            && ctx.title.is_none()
            && ctx
                .message_pool
                .values()
                .any(|msg| matches!(msg.message.role, context_manager::Role::Assistant))
    };

    if !should_generate {
        return;
    }

    tracing::info!(
        context_id = %context_id,
        "Auto-generating title for context"
    );

    // Use the same generation logic (no duplication!)
    let params = types::TitleGenerationParams::default();
    match generator::generate_title(app_state, &context, context_id, params).await {
        Ok(title) => {
            tracing::info!(
                context_id = %context_id,
                title = %title,
                "Auto-generated title for context"
            );
        }
        Err(err) => {
            tracing::error!(
                context_id = %context_id,
                error = %err,
                "Failed to auto-generate title"
            );
        }
    }
}
