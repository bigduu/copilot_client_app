use crate::{
    dto::{get_branch_messages, ChatContextDTO},
    middleware::extract_trace_id,
    server::AppState,
};
use actix_web::{
    delete, get, post, put,
    web::{Data, Json, Path, Query},
    HttpRequest, HttpResponse, Result,
};
use context_manager::structs::context::AgentRole;
use log::{error, info};
use serde::{Deserialize, Serialize};
use tracing;
use uuid::Uuid;

#[derive(Deserialize, Debug)]
pub struct CreateContextRequest {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
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
            let summaries: Vec<ContextSummary> = context_ids
                .into_iter()
                .map(|id| ContextSummary {
                    id: id.to_string(),
                    config: ConfigSummary {
                        model_id: "gpt-4".to_string(),
                        mode: "chat".to_string(),
                        system_prompt_id: None,
                    },
                    current_state: "Idle".to_string(),
                    active_branch_name: "main".to_string(),
                    message_count: 0,
                })
                .collect();

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
}

#[derive(Deserialize, Debug)]
pub struct AddMessageRequest {
    pub role: String,
    pub content: String,
    pub branch: Option<String>,
}

/// Get messages for a context with pagination
#[get("/contexts/{id}/messages")]
pub async fn get_context_messages(
    path: Path<Uuid>,
    query: Query<MessageQuery>,
    app_state: Data<AppState>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let branch_name = query.branch.clone().unwrap_or_else(|| "main".to_string());
    let limit = query.limit.unwrap_or(50);
    let offset = query.offset.unwrap_or(0);
    let trace_id = extract_trace_id(&http_req);

    match app_state
        .session_manager
        .load_context(context_id, trace_id)
        .await
    {
        Ok(Some(context)) => {
            // Extract messages in a short-lived read lock
            let (total, messages) = {
                let ctx = context.read().await;
                let all_messages = get_branch_messages(&ctx, &branch_name);
                let total = all_messages.len();
                let messages: Vec<_> = all_messages.into_iter().skip(offset).take(limit).collect();
                (total, messages)
            }; // Lock released here

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "messages": messages,
                "total": total,
                "limit": limit,
                "offset": offset
            })))
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

/// Add a message to a context
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
                ctx_guard.add_message_to_branch(&branch_name, message);
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

#[derive(Deserialize, Debug)]
pub struct SendMessageActionRequest {
    pub content: String,
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

    tracing::info!(
        trace_id = ?trace_id,
        context_id = %context_id,
        message_length = req.content.len(),
        "send_message_action called"
    );
    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        message_preview = %req.content.chars().take(100).collect::<String>(),
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
    );

    tracing::debug!(
        trace_id = ?trace_id,
        context_id = %context_id,
        "Calling chat_service.process_message()"
    );
    // Process the message (FSM handles everything including auto-save)
    match chat_service.process_message(req.content.clone()).await {
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
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to process message: {}", e)
            })))
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

pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(create_context)
        .service(get_context)
        .service(update_context)
        .service(delete_context)
        .service(list_contexts)
        .service(get_context_messages)
        .service(add_context_message)
        .service(approve_context_tools)
        // New action-based endpoints
        .service(send_message_action)
        .service(approve_tools_action)
        .service(get_context_state)
        // Agent role management
        .service(update_agent_role);
}
