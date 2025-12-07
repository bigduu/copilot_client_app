//! Approve tools action - continues FSM after approval

use super::types::{ActionResponse, ApproveToolsActionRequest};
use crate::{dto::ChatContextDTO, middleware::extract_trace_id, server::AppState};
use actix_web::{
    post,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use uuid::Uuid;

/// Approve tools and continue FSM processing
#[post("/contexts/{id}/actions/approve_tools")]
pub async fn approve_tools_action(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<ApproveToolsActionRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    info!("Action: Approving tools for context {}", context_id);

    // Create a chat service for this context
    let chat_service = crate::services::chat_service::ChatService::builder(
        app_state.session_manager.clone(),
        context_id,
    )
    .with_copilot_client(app_state.copilot_client.clone())
    .with_tool_executor(app_state.tool_executor.clone())
    .with_system_prompt_service(app_state.system_prompt_service.clone())
    .with_approval_manager(app_state.approval_manager.clone())
    .with_workflow_service(app_state.workflow_service.clone())
    .build()
    .map_err(|e| {
        error!("Failed to build chat service: {}", e);
        actix_web::error::ErrorInternalServerError("Failed to build chat service")
    })?;

    // Approve tool calls (FSM handles everything including auto-save)
    match chat_service
        .approve_tool_calls(req.tool_call_ids.clone())
        .await
    {
        Ok(service_response) => {
            // Load the updated context to return to client
            match app_state
                .session_manager
                .load_context(context_id, trace_id.clone())
                .await
            {
                Ok(Some(context)) => {
                    // Create DTO in a short-lived read lock
                    let (dto, status) = {
                        let ctx_lock = context.read().await;
                        let dto = ChatContextDTO::from(ctx_lock.clone());
                        let status = match service_response {
                            crate::services::chat_service::ServiceResponse::FinalMessage(_) => "idle",
                            crate::services::chat_service::ServiceResponse::AwaitingToolApproval(_) => {
                                "awaiting_tool_approval"
                            }
                            crate::services::chat_service::ServiceResponse::AwaitingAgentApproval { .. } => {
                                "awaiting_agent_approval"
                            }
                        };
                        (dto, status)
                    }; // Lock released here

                    Ok(HttpResponse::Ok().json(ActionResponse {
                        context: dto,
                        status: status.to_string(),
                    }))
                }
                Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Context not found after processing"
                }))),
                Err(e) => {
                    error!("Failed to load context after processing: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to load context: {}", e)
                    })))
                }
            }
        }
        Err(e) => {
            error!("Failed to approve tools: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to approve tools: {}", e)
            })))
        }
    }
}
