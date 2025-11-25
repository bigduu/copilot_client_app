//! Context deletion operations

use crate::server::AppState;
use actix_web::{
    delete,
    web::{Data, Path},
    HttpResponse, Result,
};
use log::{error, info};
use uuid::Uuid;

/// Delete a context
#[delete("/contexts/{id}")]
pub async fn delete_context(path: Path<Uuid>, app_state: Data<AppState>) -> Result<HttpResponse> {
    let context_id = path.into_inner();

    match app_state.session_manager.delete_context(context_id).await {
        Ok(_) => {
            info!("Deleted context: {}", context_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Context deleted successfully"
            })))
        }
        Err(e) => {
            error!("Failed to delete context: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to delete context: {}", e)
            })))
        }
    }
}
