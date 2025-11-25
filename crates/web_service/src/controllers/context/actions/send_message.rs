//! Send message action - triggers full FSM flow

use super::{
    helpers::{payload_preview, payload_type},
    types::{ActionResponse, SendMessageActionRequest},
};
use crate::{
    dto::ChatContextDTO,
    middleware::extract_trace_id,
    models::{MessagePayload, SendMessageRequest},
    server::AppState,
    services::chat_service::ChatService,
};
use actix_web::{
    post,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, ResponseError, Result,
};
use log::error;
use tracing;
use uuid::Uuid;

/// Send a message and let the backend FSM handle all processing
#[post("/contexts/{id}/actions/send_message")]
pub async fn send_message_action(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<SendMessageActionRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    let SendMessageActionRequest { body } = req.into_inner();
    let message_length = match &body.payload {
        MessagePayload::Text { content, .. } => content.len(),
        _ => 0,
    };
    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context_id,
        message_length = message_length,
        payload_type = %payload_type(&body.payload),
        "send_message_action called"
    );
    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        message_preview = %payload_preview(&body.payload),
        "Message content preview"
    );

    // Create a chat service for this context
    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "Creating ChatService instance"
    );
    let chat_service = ChatService::builder(app_state.session_manager.clone(), context_id)
        .with_copilot_client(app_state.copilot_client.clone())
        .with_tool_executor(app_state.tool_executor.clone())
        .with_system_prompt_service(app_state.system_prompt_service.clone())
        .with_approval_manager(app_state.approval_manager.clone())
        .with_workflow_service(app_state.workflow_service.clone())
        .with_event_broadcaster(app_state.event_broadcaster.clone())
        .build()
        .map_err(|e| {
            error!("Failed to build chat service: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to build chat service")
        })?;

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "Calling chat_service.process_message()"
    );
    // Process the message (FSM handles everything including auto-save)
    let service_request = SendMessageRequest::from_parts(context_id, body);

    match chat_service.process_message(service_request).await {
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

                    // Trigger auto title generation asynchronously (don't wait for it)
                    let app_state_clone = app_state.clone();
                    let trace_id_clone = trace_id.clone();
                    tokio::spawn(async move {
                        crate::controllers::context::title_generation::auto_generate_title_if_needed(
                            &app_state_clone,
                            context_id,
                            trace_id_clone,
                        )
                        .await;
                    });

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
            error!("Failed to process message: {}", e);
            // Use AppError's ResponseError trait to get the correct status code
            Ok(ResponseError::error_response(&e))
        }
    }
}
