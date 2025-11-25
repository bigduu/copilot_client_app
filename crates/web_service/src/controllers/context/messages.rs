//! Message operations domain
//!
//! This module handles message retrieval and querying:
//! - Getting messages for a context (with pagination)
//! - Batch querying messages by IDs
//! - Getting message content

use crate::{
    dto::{get_branch_messages, MessageDTO},
    middleware::extract_trace_id,
    server::AppState,
};
use actix_web::{
    get,
    web::{Data, Path, Query},
    HttpRequest, HttpResponse, Result,
};
use log::error;
use serde::Deserialize;
use uuid::Uuid;

// ============================================================================
// Types for messages domain
// ============================================================================

#[derive(Deserialize)]
pub struct MessageQuery {
    pub branch: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    /// Comma-separated list of message IDs for batch query
    pub ids: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
pub struct MessageContentQuery {
    pub from_sequence: Option<u64>,
}

// ============================================================================
// Handlers
// ============================================================================

/// Get messages for a context with pagination or batch query by IDs
#[get("/contexts/{id}/messages")]
pub async fn get_context_messages(
    path: Path<Uuid>,
    query: Query<MessageQuery>,
    app_state: Data<AppState>,
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
            // Check if this is a batch query by IDs
            if let Some(ids_str) = &query.ids {
                // Batch query mode: fetch specific messages by ID
                let requested_ids: Vec<Uuid> = ids_str
                    .split(',')
                    .filter_map(|s| Uuid::parse_str(s.trim()).ok())
                    .collect();

                let messages = {
                    let ctx = context.read().await;

                    requested_ids
                        .iter()
                        .filter_map(|msg_id| {
                            ctx.message_pool
                                .get(msg_id)
                                .map(|node| MessageDTO::from(node.clone()))
                        })
                        .collect::<Vec<_>>()
                };

                Ok(HttpResponse::Ok().json(serde_json::json!({
                    "messages": messages,
                    "requested_count": requested_ids.len(),
                    "found_count": messages.len(),
                })))
            } else {
                // Pagination mode: fetch messages from branch
                let branch_name = query.branch.clone().unwrap_or_else(|| "main".to_string());
                let limit = query.limit.unwrap_or(50);
                let offset = query.offset.unwrap_or(0);

                let (total, messages) = {
                    let ctx = context.read().await;
                    let all_messages = get_branch_messages(&ctx, &branch_name);
                    let total = all_messages.len();
                    let messages: Vec<_> =
                        all_messages.into_iter().skip(offset).take(limit).collect();
                    (total, messages)
                };

                Ok(HttpResponse::Ok().json(serde_json::json!({
                    "messages": messages,
                    "total": total,
                    "limit": limit,
                    "offset": offset
                })))
            }
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

/// Retrieve the latest textual content for a specific message
#[get("/contexts/{context_id}/messages/{message_id}/content")]
pub async fn get_message_content(
    path: Path<(Uuid, Uuid)>,
    query: Query<MessageContentQuery>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let (context_id, message_id) = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    let from_sequence = query.from_sequence.unwrap_or(0);

    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            let slice_opt = {
                let ctx = context.read().await;
                ctx.message_content_slice(message_id, Some(from_sequence))
            };

            match slice_opt {
                Some(slice) => Ok(HttpResponse::Ok().json(slice)),
                None => Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Message not found"
                }))),
            }
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(e) => {
            error!("Failed to load context for message content: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}
