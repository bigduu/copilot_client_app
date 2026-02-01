use actix_web::{web, HttpResponse, Responder};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct StopResponse {
    success: bool,
}

pub async fn handler(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let session_id = path.into_inner();
    
    // 获取并取消该会话的令牌
    let mut tokens = state.cancel_tokens.write().await;
    if let Some(token) = tokens.get(&session_id) {
        token.cancel();
        tokens.remove(&session_id);
        HttpResponse::Ok().json(StopResponse { success: true })
    } else {
        HttpResponse::NotFound().json(StopResponse { success: false })
    }
}
