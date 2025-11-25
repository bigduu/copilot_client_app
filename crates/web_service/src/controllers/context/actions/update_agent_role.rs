//! Update agent role action

use super::types::UpdateAgentRoleRequest;
use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    put,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use context_manager::AgentRole;
use log::{error, info};
use tracing;
use uuid::Uuid;

/// Update the agent role for a context
#[put("/contexts/{id}/role")]
pub async fn update_agent_role(
    app_state: Data<AppState>,
    path: Path<String>,
    req: Json<UpdateAgentRoleRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context_id,
        requested_role = %req.role,
        "update_agent_role endpoint called"
    );

    // Parse the role
    let new_role = match req.role.to_lowercase().as_str() {
        "planner" => AgentRole::Planner,
        "actor" => AgentRole::Actor,
        _ => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Invalid role: {}. Must be 'planner' or 'actor'", req.role)
            })));
        }
    };

    // Parse UUID
    let uuid = match Uuid::parse_str(&context_id) {
        Ok(id) => id,
        Err(e) => {
            error!("Invalid UUID: {}", e);
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Invalid context ID: {}", e)
            })));
        }
    };

    // Load context and update role
    match app_state
        .session_manager
        .load_context(uuid, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let mut context_lock = context.write().await;

            let old_role = context_lock.config.agent_role.clone();
            context_lock.config.agent_role = new_role.clone();
            context_lock.mark_dirty();

            tracing::info!(
                trace_id = ?trace_id,
                context_id = %uuid,
                old_role = ?old_role,
                new_role = ?new_role,
                "Agent role updated successfully"
            );

            // Save the updated context
            if let Err(e) = app_state
                .session_manager
                .save_context(&mut *context_lock)
                .await
            {
                error!("Failed to save context after role update: {}", e);
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to save context: {}", e)
                })));
            }

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "context_id": uuid.to_string(),
                "old_role": format!("{:?}", old_role).to_lowercase(),
                "new_role": format!("{:?}", new_role).to_lowercase(),
                "message": "Agent role updated successfully"
            })))
        }
        Ok(None) => {
            error!("Context not found: {}", uuid);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": format!("Context not found: {}", uuid)
            })))
        }
        Err(e) => {
            error!("Failed to load context: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}
