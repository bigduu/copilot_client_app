//! Tool approval domain (DEPRECATED)
//!
//! This module handles the legacy tool approval endpoint.
//! This endpoint is deprecated and will be removed in a future version.
//!
//! Use the action-based API (`actions.rs`) instead.

use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    post,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use serde::Deserialize;
use uuid::Uuid;

// ============================================================================
// Types for tool approval domain
// ============================================================================

#[derive(Deserialize, Debug)]
pub struct ApproveToolsRequest {
    pub tool_call_ids: Vec<String>,
}

// ============================================================================
// Handlers
// ============================================================================

/// Approve tool calls (DEPRECATED - use action-based API instead)
#[post("/contexts/{id}/tools/approve")]
pub async fn approve_context_tools(
    path: Path<Uuid>,
    req: Json<ApproveToolsRequest>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            // Approve tools and save in a single write lock scope
            let result = {
                let mut ctx_guard = context.write().await;
                let active_branch_name = ctx_guard.active_branch_name.clone();

                // Find and approve tool calls in the active branch
                let mut modified = false;
                if let Some(branch) = ctx_guard.branches.get_mut(&active_branch_name) {
                    if let Some(last_message_id) = branch.message_ids.last().cloned() {
                        if let Some(node) = ctx_guard.message_pool.get_mut(&last_message_id) {
                            if let Some(tool_calls) = &mut node.message.tool_calls {
                                for tool_call in tool_calls.iter_mut() {
                                    if req.tool_call_ids.contains(&tool_call.id) {
                                        tool_call.approval_status =
                                            context_manager::structs::tool::ApprovalStatus::Approved;
                                        modified = true;
                                    }
                                }
                            }
                        }
                    }
                }

                if modified {
                    ctx_guard.mark_dirty();
                }

                // Save context
                app_state
                    .session_manager
                    .save_context(&mut *ctx_guard)
                    .await
            }; // Lock released here

            match result {
                Ok(_) => {
                    info!("Approved tools for context: {}", context_id);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "message": "Tools approved successfully"
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
            error!("Failed to load context: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}
