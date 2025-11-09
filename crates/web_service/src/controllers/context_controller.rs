use crate::{
    dto::{get_branch_messages, ChatContextDTO, ContentPartDTO},
    error::AppError,
    middleware::extract_trace_id,
    models::{MessagePayload, SendMessageRequest, SendMessageRequestBody},
    server::AppState,
};
use actix_web::{
    delete, get, post, put,
    web::{Data, Json, Path, Query},
    HttpRequest, HttpResponse, ResponseError, Result,
};
use actix_web_lab::{sse, util::InfallibleStream};
use context_manager::AgentRole;
use copilot_client::api::models::{
    ChatCompletionRequest, ChatCompletionResponse, ChatMessage, Content,
    ContentPart as ClientContentPart, Role as ClientRole,
};
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::{fs, path::Path as FsPath};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing;
use uuid::Uuid;

#[derive(Deserialize, Debug)]
pub struct CreateContextRequest {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct CreateContextResponse {
    pub id: String,
}

#[derive(Serialize, Debug)]
pub struct ListContextsResponse {
    pub contexts: Vec<ContextSummary>,
}

#[derive(Serialize, Debug)]
pub struct ContextSummary {
    pub id: String,
    pub config: ConfigSummary,
    pub current_state: String,
    pub active_branch_name: String,
    pub message_count: usize,
}

#[derive(Serialize, Debug)]
pub struct ConfigSummary {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct WorkspaceUpdateRequest {
    pub workspace_path: String,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceInfoResponse {
    pub workspace_path: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceFileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Serialize, Debug)]
pub struct WorkspaceFilesResponse {
    pub workspace_path: String,
    pub files: Vec<WorkspaceFileEntry>,
}

#[derive(Deserialize, Debug, Default)]
pub struct GenerateTitleRequest {
    pub max_length: Option<usize>,
    pub message_limit: Option<usize>,
    pub fallback_title: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct GenerateTitleResponse {
    pub title: String,
}

/// Lightweight context metadata response (for Signal-Pull architecture)
#[derive(Serialize, Debug)]
pub struct ContextMetadataResponse {
    pub id: String,
    pub current_state: String,
    pub active_branch_name: String,
    pub message_count: usize,
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub workspace_path: Option<String>,
}

/// Response for streaming chunks query
#[derive(Serialize, Debug)]
pub struct StreamingChunksResponse {
    pub context_id: String,
    pub message_id: String,
    pub chunks: Vec<ChunkDTO>,
    pub current_sequence: u64,
    pub has_more: bool,
}

#[derive(Serialize, Debug)]
pub struct ChunkDTO {
    pub sequence: u64,
    pub delta: String,
}

/// Signal-Pull SSE Event Types
#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalEvent {
    /// Context state has changed (e.g., Idle -> ProcessingUserMessage)
    StateChanged {
        context_id: String,
        new_state: String,
        timestamp: String,
    },
    /// New message created (signal only, frontend should pull message details via REST)
    MessageCreated { message_id: String, role: String },
    /// Message content has new chunks available (frontend should pull via REST)
    ContentDelta {
        context_id: String,
        message_id: String,
        current_sequence: u64,
        timestamp: String,
    },
    /// Message streaming/processing completed
    MessageCompleted {
        context_id: String,
        message_id: String,
        final_sequence: u64,
        timestamp: String,
    },
    /// Keep-alive heartbeat
    Heartbeat { timestamp: String },
}

fn extract_message_text(content: &Content) -> String {
    match content {
        Content::Text(text) => text.clone(),
        Content::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ClientContentPart::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn sanitize_title(raw: &str, max_length: usize, fallback: &str) -> String {
    let first_line = raw.lines().next().unwrap_or("");
    let cleaned = first_line.trim().trim_matches(|c: char| match c {
        '"' | '\'' | '“' | '”' | '‘' | '’' => true,
        _ => false,
    });

    if cleaned.is_empty() {
        return fallback.to_string();
    }

    let mut truncated: String = cleaned.chars().take(max_length).collect();
    if truncated.chars().count() == max_length && cleaned.chars().count() > max_length {
        if let Some(last_space) = truncated.rfind(' ') {
            truncated.truncate(last_space);
        }
    }

    let trimmed = truncated
        .trim()
        .trim_matches(|c: char| matches!(c, '.' | '-' | ':' | ','))
        .trim();

    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

/// Create a new chat context
#[post("/contexts")]
pub async fn create_context(
    app_state: Data<AppState>,
    req: Json<CreateContextRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let trace_id = extract_trace_id(&http_req);
    tracing::debug!(
        trace_id = ?trace_id,
        model_id = %req.model_id,
        mode = %req.mode,
        system_prompt_id = ?req.system_prompt_id,
        "create_context endpoint called"
    );

    match app_state
        .session_manager
        .create_session(req.model_id.clone(), req.mode.clone(), trace_id.clone())
        .await
    {
        Ok(session) => {
            // Get the ID first, then handle system_prompt in a single write lock
            let session_id = {
                let mut session_guard = session.write().await;
                let id = session_guard.id;

                // If system_prompt_id is provided, attach it to the context config
                if let Some(system_prompt_id) = &req.system_prompt_id {
                    tracing::debug!(
                        trace_id = ?trace_id,
                        context_id = %id,
                        system_prompt_id = %system_prompt_id,
                        "Attaching system prompt to context"
                    );
                    session_guard.config.system_prompt_id = Some(system_prompt_id.clone());
                    session_guard.mark_dirty();

                    app_state
                        .session_manager
                        .save_context(&mut *session_guard)
                        .await
                        .map_err(|e| {
                            error!("Failed to save context with system prompt: {}", e);
                            actix_web::error::ErrorInternalServerError("Failed to save context")
                        })?;
                }

                if let Some(workspace_path) = &req.workspace_path {
                    tracing::debug!(
                        trace_id = ?trace_id,
                        context_id = %id,
                        workspace_path = %workspace_path,
                        "Attaching workspace path to context"
                    );
                    session_guard.set_workspace_path(Some(workspace_path.clone()));

                    app_state
                        .session_manager
                        .save_context(&mut *session_guard)
                        .await
                        .map_err(|e| {
                            error!("Failed to save context with workspace path: {}", e);
                            actix_web::error::ErrorInternalServerError("Failed to save context")
                        })?;
                }

                id
            }; // Lock is dropped here

            tracing::info!(
                trace_id = ?trace_id,
                context_id = %session_id,
                "Context created successfully"
            );

            info!("Created new chat context: {}", session_id);
            Ok(HttpResponse::Ok().json(CreateContextResponse {
                id: session_id.to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to create context: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create context: {}", e)
            })))
        }
    }
}

/// Get a specific context by ID
#[get("/contexts/{id}")]
pub async fn get_context(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "get_context endpoint called"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            // Create DTO in a short-lived read lock
            let dto = {
                let ctx = context.read().await;
                tracing::debug!(
                    trace_id = ?trace_id,
                    context_id = %context_id,
                    state = ?ctx.current_state,
                    message_count = ctx.message_pool.len(),
                    "Context loaded successfully"
                );
                ChatContextDTO::from(ctx.clone())
            }; // Lock released here

            Ok(HttpResponse::Ok().json(dto))
        }
        Ok(None) => {
            tracing::info!(
                trace_id = ?trace_id,
                context_id = %context_id,
                "Context not found"
            );
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(e) => {
            tracing::error!(
                trace_id = ?trace_id,
                context_id = %context_id,
                error = %e,
                "Failed to load context"
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

/// Get lightweight context metadata (for Signal-Pull architecture)
#[get("/contexts/{id}/metadata")]
pub async fn get_context_metadata(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "get_context_metadata endpoint called"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let metadata = {
                let ctx = context.read().await;
                ContextMetadataResponse {
                    id: ctx.id.to_string(),
                    current_state: format!("{:?}", ctx.current_state),
                    active_branch_name: ctx.active_branch_name.clone(),
                    message_count: ctx.message_pool.len(),
                    model_id: ctx.config.model_id.clone(),
                    mode: ctx.config.mode.clone(),
                    system_prompt_id: ctx.config.system_prompt_id.clone(),
                    workspace_path: ctx.config.workspace_path.clone(),
                }
            };

            Ok(HttpResponse::Ok().json(metadata))
        }
        Ok(None) => {
            tracing::info!(
                trace_id = ?trace_id,
                context_id = %context_id,
                "Context not found"
            );
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(e) => {
            tracing::error!(
                trace_id = ?trace_id,
                context_id = %context_id,
                error = %e,
                "Failed to load context metadata"
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

#[put("/contexts/{id}/workspace")]
pub async fn set_context_workspace(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    payload: Json<WorkspaceUpdateRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    let requested_path = payload.workspace_path.trim();

    if requested_path.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "workspace_path cannot be empty"
        })));
    }

    let canonical_path = match fs::canonicalize(FsPath::new(requested_path)) {
        Ok(path) => path,
        Err(err) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Invalid workspace path: {}", err)
            })));
        }
    };

    match fs::metadata(&canonical_path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "workspace_path must be a directory"
                })));
            }
        }
        Err(err) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Failed to read workspace metadata: {}", err)
            })));
        }
    }

    let workspace_string = canonical_path.to_string_lossy().to_string();

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let mut ctx = context.write().await;
            ctx.set_workspace_path(Some(workspace_string.clone()));

            if let Err(err) = app_state.session_manager.save_context(&mut ctx).await {
                error!("Failed to save workspace path: {}", err);
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to persist workspace path"
                })));
            }

            Ok(HttpResponse::Ok().json(WorkspaceInfoResponse {
                workspace_path: Some(workspace_string),
            }))
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!("Failed to load context for workspace update: {}", err);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}

#[get("/contexts/{id}/workspace")]
pub async fn get_context_workspace(
    path: Path<Uuid>,
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
            let ctx = context.read().await;
            Ok(HttpResponse::Ok().json(WorkspaceInfoResponse {
                workspace_path: ctx.workspace_path().map(|s| s.to_string()),
            }))
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!("Failed to load context for workspace fetch: {}", err);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}

#[get("/contexts/{id}/workspace/files")]
pub async fn list_workspace_files(
    path: Path<Uuid>,
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
            let ctx = context.read().await;
            let workspace_path = match ctx.workspace_path() {
                Some(path) => path.to_string(),
                None => {
                    return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                        "error": "Workspace path is not set for this context"
                    })));
                }
            };

            match fs::read_dir(&workspace_path) {
                Ok(entries) => {
                    let mut files: Vec<WorkspaceFileEntry> = Vec::new();

                    for entry_result in entries {
                        if let Ok(entry) = entry_result {
                            if let Ok(file_name) = entry.file_name().into_string() {
                                if file_name.starts_with('.') {
                                    continue;
                                }

                                if let Ok(file_type) = entry.file_type() {
                                    files.push(WorkspaceFileEntry {
                                        name: file_name.clone(),
                                        path: entry.path().to_string_lossy().to_string(),
                                        is_directory: file_type.is_dir(),
                                    });
                                }
                            }
                        }
                    }

                    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

                    Ok(HttpResponse::Ok().json(WorkspaceFilesResponse {
                        workspace_path,
                        files,
                    }))
                }
                Err(err) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to read workspace directory: {}", err)
                }))),
            }
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!("Failed to load context for workspace file listing: {}", err);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}

#[post("/contexts/{id}/generate-title")]
pub async fn generate_context_title(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<GenerateTitleRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    let params = req.into_inner();

    let max_length = params.max_length.unwrap_or(60).max(10);
    let message_limit = params.message_limit.unwrap_or(6).max(1);
    let fallback_title = params
        .fallback_title
        .unwrap_or_else(|| "New Chat".to_string());

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let (model_id, conversation_lines) = {
                let ctx = context.read().await;
                let model_id = ctx.config.model_id.clone();
                let mut lines: Vec<String> = Vec::new();
                let branch_messages = get_branch_messages(&ctx, &ctx.active_branch_name);

                for message in branch_messages.iter().filter(|msg| {
                    msg.role.eq_ignore_ascii_case("user")
                        || msg.role.eq_ignore_ascii_case("assistant")
                }) {
                    let mut text_parts = Vec::new();
                    for part in &message.content {
                        if let ContentPartDTO::Text { text } = part {
                            if !text.trim().is_empty() {
                                text_parts.push(text.trim());
                            }
                        }
                    }

                    if text_parts.is_empty() {
                        continue;
                    }

                    let role_label = if message.role.eq_ignore_ascii_case("user") {
                        "User"
                    } else {
                        "Assistant"
                    };
                    lines.push(format!("{}: {}", role_label, text_parts.join("\n")));
                }

                if lines.len() > message_limit {
                    let start = lines.len() - message_limit;
                    lines = lines.split_off(start);
                }

                (model_id, lines)
            };

            if conversation_lines.is_empty() {
                return Ok(HttpResponse::Ok().json(GenerateTitleResponse {
                    title: fallback_title,
                }));
            }

            let conversation_input = conversation_lines.join("\n");
            let instructions = format!(
                "You generate concise, descriptive chat titles. Respond with Title Case text, without quotes or trailing punctuation. Maximum length: {} characters. If there is not enough context, respond with '{}'.",
                max_length, fallback_title
            );

            let mut request = ChatCompletionRequest::default();
            request.model = model_id;
            request.stream = Some(false);
            request.messages = vec![
                ChatMessage {
                    role: ClientRole::System,
                    content: Content::Text(instructions),
                    tool_calls: None,
                    tool_call_id: None,
                },
                ChatMessage {
                    role: ClientRole::User,
                    content: Content::Text(conversation_input),
                    tool_calls: None,
                    tool_call_id: None,
                },
            ];

            let response = match app_state
                .copilot_client
                .send_chat_completion_request(request)
                .await
            {
                Ok(resp) => resp,
                Err(err) => {
                    error!(
                        "Failed to request title generation for context {}: {}",
                        context_id, err
                    );
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to generate chat title"
                    })));
                }
            };

            let status = response.status();
            let body = match response.bytes().await {
                Ok(bytes) => bytes,
                Err(err) => {
                    error!(
                        "Failed to read title generation response for context {}: {}",
                        context_id, err
                    );
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to read title generation response"
                    })));
                }
            };

            if !status.is_success() {
                error!(
                    "Title generation request failed for context {}: status {} body {}",
                    context_id,
                    status,
                    String::from_utf8_lossy(&body)
                );
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Upstream service failed to generate title"
                })));
            }

            let completion: ChatCompletionResponse = match serde_json::from_slice(&body) {
                Ok(parsed) => parsed,
                Err(err) => {
                    error!(
                        "Failed to parse title generation response for context {}: {}",
                        context_id, err
                    );
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to parse title generation response"
                    })));
                }
            };

            let raw_title = completion
                .choices
                .first()
                .map(|choice| extract_message_text(&choice.message.content))
                .unwrap_or_default();

            let sanitized = sanitize_title(&raw_title, max_length, &fallback_title);

            Ok(HttpResponse::Ok().json(GenerateTitleResponse { title: sanitized }))
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!(
                "Failed to load context {} for title generation: {}",
                context_id, err
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}

/// Update a context
#[put("/contexts/{id}")]
pub async fn update_context(
    path: Path<Uuid>,
    req: Json<ChatContextDTO>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    // For now, we only support updating the system prompt ID
    // Full context updates would require deserializing and merging which is complex
    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            // Update and save in a single write lock scope
            let result = {
                let mut ctx_guard = context.write().await;
                ctx_guard.config.system_prompt_id = req.config.system_prompt_id.clone();
                ctx_guard.mark_dirty();
                app_state
                    .session_manager
                    .save_context(&mut *ctx_guard)
                    .await
            }; // Lock released here

            match result {
                Ok(_) => {
                    info!("Updated context: {}", context_id);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "message": "Context updated successfully"
                    })))
                }
                Err(e) => {
                    error!("Failed to save context: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to save context: {}", e)
                    })))
                }
            }
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(e) => {
            error!("Failed to load context for update: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

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

/// List all contexts
#[get("/contexts")]
pub async fn list_contexts(
    app_state: Data<AppState>,
    _http_req: HttpRequest,
) -> Result<HttpResponse> {
    // Simplified version - just return IDs without loading full contexts
    match app_state.session_manager.list_contexts().await {
        Ok(context_ids) => {
            let mut summaries: Vec<ContextSummary> = Vec::new();

            for id in context_ids {
                let summary = if let Ok(Some(context)) =
                    app_state.session_manager.load_context(id, None).await
                {
                    let ctx = context.read().await;
                    ContextSummary {
                        id: ctx.id.to_string(),
                        config: ConfigSummary {
                            model_id: ctx.config.model_id.clone(),
                            mode: ctx.config.mode.clone(),
                            system_prompt_id: ctx.config.system_prompt_id.clone(),
                            workspace_path: ctx.config.workspace_path.clone(),
                        },
                        current_state: format!("{:?}", ctx.current_state),
                        active_branch_name: ctx.active_branch_name.clone(),
                        message_count: ctx.message_pool.len(),
                    }
                } else {
                    ContextSummary {
                        id: id.to_string(),
                        config: ConfigSummary {
                            model_id: "gpt-4".to_string(),
                            mode: "chat".to_string(),
                            system_prompt_id: None,
                            workspace_path: None,
                        },
                        current_state: "Unknown".to_string(),
                        active_branch_name: "main".to_string(),
                        message_count: 0,
                    }
                };

                summaries.push(summary);
            }

            Ok(HttpResponse::Ok().json(ListContextsResponse {
                contexts: summaries,
            }))
        }
        Err(e) => {
            error!("Failed to list contexts: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list contexts: {}", e)
            })))
        }
    }
}

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

#[derive(Deserialize, Debug)]
pub struct AddMessageRequest {
    pub role: String,
    pub content: String,
    pub branch: Option<String>,
}

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
                    use crate::dto::MessageDTO;

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

/// Retrieve the latest textual content for a specific message.
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

/// Get streaming chunks for a message (for Signal-Pull incremental content retrieval)
#[get("/contexts/{context_id}/messages/{message_id}/streaming-chunks")]
pub async fn get_streaming_chunks(
    path: Path<(Uuid, Uuid)>,
    query: Query<MessageContentQuery>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let (context_id, message_id) = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    let from_sequence = query.from_sequence.unwrap_or(0);

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        message_id = %message_id,
        from_sequence = from_sequence,
        "get_streaming_chunks endpoint called"
    );

    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let (chunks_opt, current_seq_opt) = {
                let ctx = context.read().await;
                let chunks = ctx.get_streaming_chunks_after(message_id, from_sequence);
                let current_seq = ctx.get_streaming_sequence(message_id);
                (chunks, current_seq)
            };

            match (chunks_opt, current_seq_opt) {
                (Some(chunks), Some(current_sequence)) => {
                    let chunk_dtos: Vec<ChunkDTO> = chunks
                        .into_iter()
                        .map(|(seq, delta)| ChunkDTO {
                            sequence: seq,
                            delta,
                        })
                        .collect();

                    let has_more = !chunk_dtos.is_empty();

                    let response = StreamingChunksResponse {
                        context_id: context_id.to_string(),
                        message_id: message_id.to_string(),
                        chunks: chunk_dtos,
                        current_sequence,
                        has_more,
                    };

                    Ok(HttpResponse::Ok().json(response))
                }
                (None, _) | (_, None) => {
                    tracing::info!(
                        trace_id = ?trace_id,
                        context_id = %context_id,
                        message_id = %message_id,
                        "Message not found or not a streaming message"
                    );
                    Ok(HttpResponse::NotFound().json(serde_json::json!({
                        "error": "Message not found or not a streaming message"
                    })))
                }
            }
        }
        Ok(None) => {
            tracing::info!(
                trace_id = ?trace_id,
                context_id = %context_id,
                "Context not found"
            );
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(e) => {
            tracing::error!(
                trace_id = ?trace_id,
                context_id = %context_id,
                error = %e,
                "Failed to load context for streaming chunks"
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

/// Subscribe to Signal-Pull SSE events for a context
/// This endpoint establishes a Server-Sent Events stream for lightweight signals.
/// Frontend should use REST APIs to pull actual data upon receiving signals.
#[get("/contexts/{id}/events")]
pub async fn subscribe_context_events(
    path: Path<Uuid>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<sse::Sse<InfallibleStream<ReceiverStream<sse::Event>>>> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "SSE subscription requested for context events"
    );

    // Verify context exists
    match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(_context)) => {
            // Subscribe to the event broadcaster for this context
            let mut event_rx = app_state.event_broadcaster.subscribe(context_id).await;

            let (tx, rx) = mpsc::channel::<sse::Event>(32);

            // Spawn a background task to forward events from broadcaster to SSE
            let context_id_str = context_id.to_string();

            tokio::spawn(async move {
                let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(30));

                loop {
                    tokio::select! {
                        // Forward events from broadcaster
                        Some(event) = event_rx.recv() => {
                            if tx.send(event).await.is_err() {
                                tracing::debug!(
                                    context_id = %context_id_str,
                                    "SSE client disconnected while sending event"
                                );
                                break;
                            }
                        }
                        // Send periodic heartbeat
                        _ = heartbeat_interval.tick() => {
                            let event = SignalEvent::Heartbeat {
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            };

                            if let Ok(data) = sse::Data::new_json(&event) {
                                if tx.send(sse::Event::Data(data.event("signal"))).await.is_err() {
                                    tracing::debug!(
                                        context_id = %context_id_str,
                                        "SSE client disconnected (heartbeat)"
                                    );
                                    break;
                                }
                            }
                        }
                    }
                }

                tracing::info!(
                    context_id = %context_id_str,
                    "SSE event stream closed"
                );
            });

            let sse_stream =
                sse::Sse::from_infallible_receiver(rx).with_keep_alive(Duration::from_secs(15));

            Ok(sse_stream)
        }
        Ok(None) => {
            tracing::warn!(
                trace_id = ?trace_id,
                context_id = %context_id,
                "Context not found for SSE subscription"
            );
            Err(actix_web::error::ErrorNotFound("Context not found"))
        }
        Err(e) => {
            tracing::error!(
                trace_id = ?trace_id,
                context_id = %context_id,
                error = %e,
                "Failed to load context for SSE subscription"
            );
            Err(actix_web::error::ErrorInternalServerError(
                "Failed to load context",
            ))
        }
    }
}

/// Add a message to a context (DEPRECATED - OLD CRUD ENDPOINT)
///
/// ⚠️  **DEPRECATED**: This endpoint does NOT trigger the FSM (Finite State Machine).
/// No assistant response will be generated. This is a legacy endpoint for direct message manipulation.
///
/// **Use instead**: `POST /contexts/{id}/actions/send_message` for proper FSM-driven message handling
/// that triggers LLM responses, tool execution, and full conversation flow.
///
/// This endpoint will be removed in a future version.
#[deprecated(
    since = "0.2.0",
    note = "Use POST /contexts/{id}/actions/send_message instead. This endpoint does not trigger FSM."
)]
#[post("/contexts/{id}/messages")]
pub async fn add_context_message(
    path: Path<Uuid>,
    req: Json<AddMessageRequest>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let branch_name = req.branch.clone().unwrap_or_else(|| "main".to_string());
    let trace_id = extract_trace_id(&http_req);

    info!("=== add_context_message (OLD CRUD ENDPOINT) CALLED ===");
    info!("Context ID: {}", context_id);
    info!("Message role: {}, content: {}", req.role, req.content);
    info!("Branch: {}", branch_name);
    log::warn!("⚠️  WARNING: This endpoint does NOT trigger FSM!");
    log::warn!("⚠️  No assistant response will be generated!");
    log::warn!(
        "⚠️  Use POST /contexts/{}/actions/send_message instead!",
        context_id
    );

    // Parse role
    let role = match req.role.as_str() {
        "system" => context_manager::structs::message::Role::System,
        "user" => context_manager::structs::message::Role::User,
        "assistant" => context_manager::structs::message::Role::Assistant,
        "tool" => context_manager::structs::message::Role::Tool,
        _ => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid role. Must be 'system', 'user', 'assistant', or 'tool'"
            })))
        }
    };

    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            // Create internal message
            let message = context_manager::structs::message::InternalMessage {
                role,
                content: vec![context_manager::structs::message::ContentPart::Text {
                    text: req.content.clone(),
                }],
                ..Default::default()
            };

            // Add message and save in a single write lock scope
            let result = {
                let mut ctx_guard = context.write().await;
                let _ = ctx_guard.add_message_to_branch(&branch_name, message);
                // Save context (add_message_to_branch already marks as dirty)
                app_state
                    .session_manager
                    .save_context(&mut *ctx_guard)
                    .await
            }; // Lock released here

            match result {
                Ok(_) => {
                    info!(
                        "Added message to context: {}, branch: {}",
                        context_id, branch_name
                    );
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "message": "Message added successfully"
                    })))
                }
                Err(e) => {
                    error!("Failed to save context: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to save context: {}", e)
                    })))
                }
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

#[derive(Deserialize, Debug)]
pub struct ApproveToolsRequest {
    pub tool_call_ids: Vec<String>,
}

/// Approve tool calls for a context
#[post("/contexts/{id}/tools/approve")]
pub async fn approve_context_tools(
    path: Path<Uuid>,
    req: Json<ApproveToolsRequest>,
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
            // Approve tools and save in a single write lock scope
            let result = {
                let mut ctx_guard = context.write().await;
                let active_branch_name = ctx_guard.active_branch_name.clone();

                // Find and approve tool calls in the active branch
                let mut modified = false;
                if let Some(branch) = ctx_guard.branches.get_mut(&active_branch_name) {
                    if let Some(last_message_id) = branch.message_ids.last().cloned() {
                        if let Some(node) = ctx_guard.message_pool.get_mut(&last_message_id) {
                            if let Some(tool_calls) = &mut node.message.tool_calls {
                                for tool_call in tool_calls.iter_mut() {
                                    if req.tool_call_ids.contains(&tool_call.id) {
                                        tool_call.approval_status =
                                            context_manager::structs::tool::ApprovalStatus::Approved;
                                        modified = true;
                                    }
                                }
                            }
                        }
                    }
                }

                if modified {
                    ctx_guard.mark_dirty();
                }

                // Save context
                app_state
                    .session_manager
                    .save_context(&mut *ctx_guard)
                    .await
            }; // Lock released here

            match result {
                Ok(_) => {
                    info!("Approved tools for context: {}", context_id);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "message": "Tools approved successfully"
                    })))
                }
                Err(e) => {
                    error!("Failed to save context: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to save context: {}", e)
                    })))
                }
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

// ============================================================================
// ACTION-BASED API ENDPOINTS (Backend-First Architecture)
// ============================================================================

#[derive(Deserialize, Debug, Clone)]
pub struct SendMessageActionRequest {
    #[serde(flatten)]
    pub body: SendMessageRequestBody,
}

#[derive(Serialize, Debug)]
pub struct ActionResponse {
    pub context: ChatContextDTO,
    pub status: String, // "idle", "awaiting_tool_approval", etc.
}

/// Send a message and let the backend FSM handle all processing
/// POST /api/contexts/{id}/actions/send_message
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
    let mut chat_service = crate::services::chat_service::ChatService::new(
        app_state.session_manager.clone(),
        context_id,
        app_state.copilot_client.clone(),
        app_state.tool_executor.clone(),
        app_state.system_prompt_enhancer.clone(),
        app_state.system_prompt_service.clone(),
        app_state.approval_manager.clone(),
        app_state.workflow_service.clone(),
    )
    .with_event_broadcaster(app_state.event_broadcaster.clone());

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

#[derive(Deserialize, Debug)]
pub struct ApproveToolsActionRequest {
    pub tool_call_ids: Vec<String>,
}

/// Approve tool calls and let the backend FSM continue processing
/// POST /api/contexts/{id}/actions/approve_tools
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
    let mut chat_service = crate::services::chat_service::ChatService::new(
        app_state.session_manager.clone(),
        context_id,
        app_state.copilot_client.clone(),
        app_state.tool_executor.clone(),
        app_state.system_prompt_enhancer.clone(),
        app_state.system_prompt_service.clone(),
        app_state.approval_manager.clone(),
        app_state.workflow_service.clone(),
    );

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

/// Get the current state of a context for polling
/// GET /api/contexts/{id}/state
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

/// Request to update agent role
#[derive(Deserialize, Debug)]
pub struct UpdateAgentRoleRequest {
    pub role: String, // "planner" or "actor"
}

/// Update the agent role for a context
#[put("/contexts/{id}/role")]
pub async fn update_agent_role(
    app_state: Data<AppState>,
    path: Path<String>,
    req: Json<UpdateAgentRoleRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context_id,
        requested_role = %req.role,
        "update_agent_role endpoint called"
    );

    // Parse the role
    let new_role = match req.role.to_lowercase().as_str() {
        "planner" => AgentRole::Planner,
        "actor" => AgentRole::Actor,
        _ => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Invalid role: {}. Must be 'planner' or 'actor'", req.role)
            })));
        }
    };

    // Parse UUID
    let uuid = match Uuid::parse_str(&context_id) {
        Ok(id) => id,
        Err(e) => {
            error!("Invalid UUID: {}", e);
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Invalid context ID: {}", e)
            })));
        }
    };

    // Load context and update role
    match app_state
        .session_manager
        .load_context(uuid, trace_id.clone())
        .await
    {
        Ok(Some(context)) => {
            let mut context_lock = context.write().await;

            let old_role = context_lock.config.agent_role.clone();
            context_lock.config.agent_role = new_role.clone();
            context_lock.mark_dirty();

            tracing::info!(
                trace_id = ?trace_id,
                context_id = %uuid,
                old_role = ?old_role,
                new_role = ?new_role,
                "Agent role updated successfully"
            );

            // Save the updated context
            if let Err(e) = app_state
                .session_manager
                .save_context(&mut *context_lock)
                .await
            {
                error!("Failed to save context after role update: {}", e);
                return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": format!("Failed to save context: {}", e)
                })));
            }

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "context_id": uuid.to_string(),
                "old_role": format!("{:?}", old_role).to_lowercase(),
                "new_role": format!("{:?}", new_role).to_lowercase(),
                "message": "Agent role updated successfully"
            })))
        }
        Ok(None) => {
            error!("Context not found: {}", uuid);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": format!("Context not found: {}", uuid)
            })))
        }
        Err(e) => {
            error!("Failed to load context: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to load context: {}", e)
            })))
        }
    }
}

fn payload_type(payload: &MessagePayload) -> &'static str {
    match payload {
        MessagePayload::Text { .. } => "text",
        MessagePayload::FileReference { .. } => "file_reference",
        MessagePayload::Workflow { .. } => "workflow",
        MessagePayload::ToolResult { .. } => "tool_result",
    }
}

fn payload_preview(payload: &MessagePayload) -> String {
    match payload {
        MessagePayload::Text { content, .. } => content.chars().take(120).collect(),
        MessagePayload::FileReference { path, .. } => format!("file_reference: {}", path),
        MessagePayload::Workflow { workflow, .. } => format!("workflow: {}", workflow),
        MessagePayload::ToolResult { tool_name, .. } => format!("tool_result: {}", tool_name),
    }
}

pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(create_context)
        .service(get_context)
        .service(get_context_metadata) // Signal-Pull: lightweight metadata
        .service(update_context)
        .service(delete_context)
        .service(list_contexts)
        .service(generate_context_title)
        .service(get_context_messages) // Now supports batch query via ?ids=...
        .service(get_message_content)
        .service(get_streaming_chunks) // Signal-Pull: incremental streaming chunks
        .service(subscribe_context_events) // Signal-Pull: SSE event stream
        .service(add_context_message)
        .service(approve_context_tools)
        // New action-based endpoints
        .service(send_message_action)
        .service(approve_tools_action)
        .service(get_context_state)
        // Agent role management
        .service(update_agent_role)
        // Workspace management
        .service(set_context_workspace)
        .service(get_context_workspace)
        .service(list_workspace_files);
}
