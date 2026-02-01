use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use copilot_agent_core::Session;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub session_id: Option<String>,
    #[allow(dead_code)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub session_id: String,
    pub stream_url: String,
    pub status: String,
}

pub async fn handler(
    state: web::Data<AppState>,
    req: web::Json<ChatRequest>,
) -> impl Responder {
    let session_id = req.session_id.clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // 获取或创建会话
    let mut sessions = state.sessions.write().await;
    let session = sessions.entry(session_id.clone()).or_insert_with(|| {
        Session::new(session_id.clone())
    });

    // 添加用户消息到会话
    session.add_message(copilot_agent_core::Message::user(req.message.clone()));

    // 保存会话
    let _ = state.storage.save_session(session).await;
    
    HttpResponse::Created().json(ChatResponse {
        session_id: session_id.clone(),
        stream_url: format!("/api/v1/stream/{}", session_id),
        status: "streaming".to_string(),
    })
}
