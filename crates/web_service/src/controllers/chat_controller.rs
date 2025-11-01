use crate::{
    middleware::extract_trace_id,
    models::CreateSessionRequest,
    server::AppState,
    services::chat_service::{ChatService, ServiceResponse},
};
use actix_web::{
    web::{self, Data},
    HttpRequest, HttpResponse, Result,
};
use log::info;
use serde_json::json;
use uuid::Uuid;

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
    message: web::Json<String>,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    let mut chat_service = ChatService::new(
        app_state.session_manager.clone(),
        *session_id,
        app_state.copilot_client.clone(),
        app_state.tool_executor.clone(),
    );
    match chat_service.process_message(message.into_inner()).await {
        Ok(response) => Ok(HttpResponse::Ok().json(response)),
        Err(e) => Ok(HttpResponse::InternalServerError().body(e.to_string())),
    }
}

pub async fn approve_tools(
    session_id: web::Path<Uuid>,
    approved_tool_calls: web::Json<Vec<String>>,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    let mut chat_service = ChatService::new(
        app_state.session_manager.clone(),
        *session_id,
        app_state.copilot_client.clone(),
        app_state.tool_executor.clone(),
    );
    match chat_service
        .approve_tool_calls(approved_tool_calls.into_inner())
        .await
    {
        Ok(ServiceResponse::FinalMessage(message)) => Ok(HttpResponse::Ok().json(message)),
        Ok(ServiceResponse::AwaitingToolApproval(tool_calls)) => {
            // This case should ideally not happen in an approval flow, but handled for completeness
            Ok(HttpResponse::Accepted().json(tool_calls))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().body(e.to_string())),
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/chat")
            .route("/", web::post().to(create_chat_session))
            .route("/{session_id}", web::post().to(send_message))
            .route("/{session_id}/approve", web::post().to(approve_tools)),
    );
}
