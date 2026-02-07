use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use bamboo_core::Session;

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
 
    let existing_session = {
        let sessions = state.sessions.read().await;
        sessions.get(&session_id).cloned()
    };

    let mut session = match existing_session {
        Some(session) => session,
        None => match state.storage.load_session(&session_id).await {
            Ok(Some(session)) => session,
            _ => Session::new(session_id.clone()),
        },
    };

    session.add_message(bamboo_core::Message::user(req.message.clone()));

    {
        let mut sessions = state.sessions.write().await;
        sessions.insert(session_id.clone(), session.clone());
    }

    let _ = state.storage.save_session(&session).await;
    
    HttpResponse::Created().json(ChatResponse {
        session_id: session_id.clone(),
        stream_url: format!("/api/v1/stream/{}", session_id),
        status: "streaming".to_string(),
    })
}
