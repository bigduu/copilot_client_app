use crate::{
    middleware::extract_trace_id,
    models::{CreateSessionRequest, SendMessageRequest, SendMessageRequestBody},
    server::AppState,
    services::chat_service::{ChatService, ServiceResponse},
};
use actix_web::{
    http::header::{HeaderName, HeaderValue},
    web::{self, Data},
    HttpRequest, HttpResponse, Responder, Result,
};
use log::info;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
pub struct AgentApprovalRequest {
    pub request_id: Uuid,
    pub approved: bool,
    pub reason: Option<String>,
}

pub async fn create_chat_session(
    app_state: Data<AppState>,
    req: web::Json<CreateSessionRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let trace_id = extract_trace_id(&http_req);
    let session = app_state
        .session_manager
        .create_session(req.model_id.clone(), req.mode.clone(), trace_id)
        .await
        .unwrap();
    let session_id = session.read().await.id;
    info!("Created new chat session: {}", session_id);
    Ok(HttpResponse::Ok().json(json!({ "session_id": session_id })))
}

pub async fn send_message(
    session_id: web::Path<Uuid>,
    body: web::Json<SendMessageRequestBody>,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    let mut chat_service = ChatService::builder(app_state.session_manager.clone(), *session_id)
        .with_copilot_client(app_state.copilot_client.clone())
        .with_tool_executor(app_state.tool_executor.clone())
        .with_system_prompt_service(app_state.system_prompt_service.clone())
        .with_approval_manager(app_state.approval_manager.clone())
        .with_workflow_service(app_state.workflow_service.clone())
        .build()
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;
    let request = SendMessageRequest::from_parts(*session_id, body.into_inner());
    match chat_service.process_message(request).await {
        Ok(response) => Ok(HttpResponse::Ok().json(response)),
        Err(e) => Ok(HttpResponse::InternalServerError().body(e.to_string())),
    }
}

/// Streaming endpoint for chat messages using Server-Sent Events
pub async fn send_message_stream(
    session_id: web::Path<Uuid>,
    body: web::Json<SendMessageRequestBody>,
    http_req: HttpRequest,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    info!("Streaming message for session: {}", session_id);

    let mut chat_service = ChatService::builder(app_state.session_manager.clone(), *session_id)
        .with_copilot_client(app_state.copilot_client.clone())
        .with_tool_executor(app_state.tool_executor.clone())
        .with_system_prompt_service(app_state.system_prompt_service.clone())
        .with_approval_manager(app_state.approval_manager.clone())
        .with_workflow_service(app_state.workflow_service.clone())
        .build()
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    let request = SendMessageRequest::from_parts(*session_id, body.into_inner());

    match chat_service.process_message_stream(request).await {
        Ok(sse_response) => {
            let mut response = sse_response.respond_to(&http_req);
            response.headers_mut().insert(
                HeaderName::from_static("x-accel-buffering"),
                HeaderValue::from_static("no"),
            );
            Ok(response)
        }
        Err(e) => Ok(HttpResponse::InternalServerError().body(e.to_string())),
    }
}

pub async fn approve_tools(
    session_id: web::Path<Uuid>,
    approved_tool_calls: web::Json<Vec<String>>,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    let mut chat_service = ChatService::builder(app_state.session_manager.clone(), *session_id)
        .with_copilot_client(app_state.copilot_client.clone())
        .with_tool_executor(app_state.tool_executor.clone())
        .with_system_prompt_service(app_state.system_prompt_service.clone())
        .with_approval_manager(app_state.approval_manager.clone())
        .with_workflow_service(app_state.workflow_service.clone())
        .build()
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;
    match chat_service
        .approve_tool_calls(approved_tool_calls.into_inner())
        .await
    {
        Ok(ServiceResponse::FinalMessage(message)) => Ok(HttpResponse::Ok().json(message)),
        Ok(ServiceResponse::AwaitingToolApproval(tool_calls)) => {
            // This case should ideally not happen in an approval flow, but handled for completeness
            Ok(HttpResponse::Accepted().json(tool_calls))
        }
        Ok(ServiceResponse::AwaitingAgentApproval { .. }) => {
            // This shouldn't happen during approval, but handle gracefully
            Ok(HttpResponse::Accepted().json(json!({"message": "Approval processed"})))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().body(e.to_string())),
    }
}

pub async fn approve_agent_tool_call(
    session_id: web::Path<Uuid>,
    approval: web::Json<AgentApprovalRequest>,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    let mut chat_service = ChatService::builder(app_state.session_manager.clone(), *session_id)
        .with_copilot_client(app_state.copilot_client.clone())
        .with_tool_executor(app_state.tool_executor.clone())
        .with_system_prompt_service(app_state.system_prompt_service.clone())
        .with_approval_manager(app_state.approval_manager.clone())
        .with_workflow_service(app_state.workflow_service.clone())
        .build()
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    match chat_service
        .continue_agent_loop_after_approval(
            approval.request_id,
            approval.approved,
            approval.reason.clone(),
        )
        .await
    {
        Ok(ServiceResponse::FinalMessage(message)) => Ok(HttpResponse::Ok().json(json!({
            "status": "completed",
            "message": message
        }))),
        Ok(ServiceResponse::AwaitingAgentApproval { .. }) => {
            Ok(HttpResponse::Accepted().json(json!({
                "status": "awaiting_approval",
                "message": "Another approval is required"
            })))
        }
        Ok(ServiceResponse::AwaitingToolApproval(_)) => Ok(HttpResponse::Accepted().json(json!({
            "status": "awaiting_tool_approval"
        }))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(json!({
            "error": e.to_string()
        }))),
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/chat")
            .route("/", web::post().to(create_chat_session))
            .route("/{session_id}", web::post().to(send_message))
            .route("/{session_id}/stream", web::post().to(send_message_stream))
            .route("/{session_id}/approve", web::post().to(approve_tools))
            .route(
                "/{session_id}/approve-agent",
                web::post().to(approve_agent_tool_call),
            ),
    );
}
