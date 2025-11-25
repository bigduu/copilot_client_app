//! Get context state - for polling current state

use super::types::ActionResponse;
use crate::{dto::ChatContextDTO, middleware::extract_trace_id, server::AppState};
use actix_web::{
    get,
    web::{Data, Path},
    HttpRequest, HttpResponse, Result,
};
use log::error;
use uuid::Uuid;

/// Get the current state of a context for polling
#[get("/contexts/{id}/state")]
pub async fn get_context_state(
    app_state: Data<AppState>,
    path: Path<Uuid>,
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
            // Create DTO and status in a short-lived read lock
            let (dto, status) = {
                let ctx_lock = context.read().await;
                let dto = ChatContextDTO::from(ctx_lock.clone());
                let status = format!("{:?}", ctx_lock.current_state).to_lowercase();
                (dto, status)
            }; // Lock released here

            Ok(HttpResponse::Ok().json(ActionResponse {
                context: dto,
                status,
            }))
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
