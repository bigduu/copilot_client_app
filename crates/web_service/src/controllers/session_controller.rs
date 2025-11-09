use actix_web::{
    web::{Data, Json, Path},
    HttpResponse, Result,
};
use log::{error, info};
use serde::{Deserialize, Serialize};
use session_manager::{MultiUserSessionManager, Theme, UserPreferences, FileSessionStorage, ToolApprovalPolicy};
use std::collections::HashMap;

/// DTO for OpenContext
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenContextDTO {
    pub context_id: String,
    pub title: String,
    pub order: usize,
}

/// DTO for UserSession
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSessionDTO {
    pub user_id: String,
    pub active_context_id: Option<String>,
    pub open_contexts: Vec<OpenContextDTO>,
    pub ui_state: HashMap<String, serde_json::Value>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub preferences: UserPreferencesDTO,
    pub last_updated: String,
}

/// DTO for UserPreferences
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferencesDTO {
    pub theme: String,
    pub language: String,
    pub font_size: u32,
    pub auto_save: bool,
    pub default_model: String,
    pub tool_approval_policy: String,
    pub code_theme: String,
    pub enable_shortcuts: bool,
    pub send_telemetry: bool,
}

/// Request: Update UI state
#[derive(Debug, Deserialize)]
pub struct UpdateUIStateRequest {
    pub key: String,
    pub value: serde_json::Value,
}

/// Request: Update preferences
#[derive(Debug, Deserialize)]
pub struct UpdatePreferencesRequest {
    pub theme: Option<String>,
    pub language: Option<String>,
    pub font_size: Option<u32>,
    pub auto_save: Option<bool>,
    pub default_model: Option<String>,
    pub tool_approval_policy: Option<String>,
    pub code_theme: Option<String>,
    pub enable_shortcuts: Option<bool>,
    pub send_telemetry: Option<bool>,
}

/// Request: Set active context
#[derive(Debug, Deserialize)]
pub struct SetActiveContextRequest {
    pub context_id: String,
}

/// Request: Open context
#[derive(Debug, Deserialize)]
pub struct OpenContextRequest {
    pub context_id: String,
    pub title: String,
}

/// Response: Success message
#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub message: String,
}

/// Response: Error message
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// Helper function to convert ToolApprovalPolicy to string
fn policy_to_string(policy: &ToolApprovalPolicy) -> String {
    match policy {
        ToolApprovalPolicy::Manual => "manual".to_string(),
        ToolApprovalPolicy::AutoApprove => "auto_approve".to_string(),
        ToolApprovalPolicy::WhiteList { .. } => "whitelist".to_string(),
        ToolApprovalPolicy::AutoLoop { .. } => "auto_loop".to_string(),
    }
}

// Helper function to convert string to ToolApprovalPolicy
fn string_to_policy(s: &str) -> ToolApprovalPolicy {
    match s {
        "auto_approve" => ToolApprovalPolicy::AutoApprove,
        "whitelist" => ToolApprovalPolicy::WhiteList { approved_tools: vec![] },
        "auto_loop" => ToolApprovalPolicy::AutoLoop { max_depth: 5, max_tools: 10 },
        _ => ToolApprovalPolicy::Manual,
    }
}

// ============================================================================
// API Handlers
// ============================================================================

/// GET /v1/session/:user_id
/// Get or create a user session
pub async fn get_session(
    path: Path<String>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let user_id = path.into_inner();

    match session_manager.get_session(&user_id).await {
        Ok(session) => {
            let dto = UserSessionDTO {
                user_id: session.user_id.clone().unwrap_or_default(),
                active_context_id: session.active_context_id.map(|id| id.to_string()),
                open_contexts: session
                    .open_contexts
                    .iter()
                    .map(|oc| OpenContextDTO {
                        context_id: oc.context_id.to_string(),
                        title: oc.title.clone(),
                        order: oc.order,
                    })
                    .collect(),
                ui_state: {
                    let mut map = HashMap::new();
                    map.insert("sidebar_collapsed".to_string(), serde_json::json!(session.ui_state.sidebar_collapsed));
                    map.insert("sidebar_width".to_string(), serde_json::json!(session.ui_state.sidebar_width));
                    map.insert("active_panel".to_string(), serde_json::json!(session.ui_state.active_panel));
                    map.insert("message_view_mode".to_string(), serde_json::json!(session.ui_state.message_view_mode));
                    map.insert("show_system_messages".to_string(), serde_json::json!(session.ui_state.show_system_messages));
                    map.insert("auto_scroll".to_string(), serde_json::json!(session.ui_state.auto_scroll));
                    map
                },
                metadata: session.metadata.clone(),
                preferences: UserPreferencesDTO {
                    theme: match session.preferences.theme {
                        Theme::Light => "light".to_string(),
                        Theme::Dark => "dark".to_string(),
                        Theme::Auto => "auto".to_string(),
                    },
                    language: session.preferences.language.clone(),
                    font_size: session.preferences.font_size,
                    auto_save: session.preferences.auto_save,
                    default_model: session.preferences.default_model.clone(),
                    tool_approval_policy: policy_to_string(&session.preferences.tool_approval_policy),
                    code_theme: session.preferences.code_theme.clone(),
                    enable_shortcuts: session.preferences.enable_shortcuts,
                    send_telemetry: session.preferences.send_telemetry,
                },
                last_updated: session.last_updated.to_rfc3339(),
            };

            info!("Retrieved session for user: {}", user_id);
            Ok(HttpResponse::Ok().json(dto))
        }
        Err(e) => {
            error!("Failed to get session for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to get session: {}", e),
            }))
        }
    }
}

/// POST /v1/session/:user_id/active-context
/// Set the active context
pub async fn set_active_context(
    path: Path<String>,
    req: Json<SetActiveContextRequest>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let user_id = path.into_inner();

    match session_manager
        .set_active_context(&user_id, Some(req.context_id.clone()))
        .await
    {
        Ok(_) => {
            info!("Set active context for user {}: {}", user_id, req.context_id);
            Ok(HttpResponse::Ok().json(SuccessResponse {
                message: "Active context updated successfully".to_string(),
            }))
        }
        Err(e) => {
            error!(
                "Failed to set active context for user {}: {}",
                user_id, e
            );
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to set active context: {}", e),
            }))
        }
    }
}

/// DELETE /v1/session/:user_id/active-context
/// Clear the active context
pub async fn clear_active_context(
    path: Path<String>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let user_id = path.into_inner();

    match session_manager.set_active_context(&user_id, None).await {
        Ok(_) => {
            info!("Cleared active context for user {}", user_id);
            Ok(HttpResponse::Ok().json(SuccessResponse {
                message: "Active context cleared successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to clear active context for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to clear active context: {}", e),
            }))
        }
    }
}

/// POST /v1/session/:user_id/open-context
/// Open a new context
pub async fn open_context(
    path: Path<String>,
    req: Json<OpenContextRequest>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let user_id = path.into_inner();

    match session_manager
        .open_context(&user_id, &req.context_id, &req.title)
        .await
    {
        Ok(_) => {
            info!(
                "Opened context {} for user {}: {}",
                req.context_id, user_id, req.title
            );
            Ok(HttpResponse::Ok().json(SuccessResponse {
                message: "Context opened successfully".to_string(),
            }))
        }
        Err(e) => {
            error!(
                "Failed to open context {} for user {}: {}",
                req.context_id, user_id, e
            );
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to open context: {}", e),
            }))
        }
    }
}

/// DELETE /v1/session/:user_id/context/:context_id
/// Close a context
pub async fn close_context(
    path: Path<(String, String)>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let (user_id, context_id) = path.into_inner();

    match session_manager.close_context(&user_id, &context_id).await {
        Ok(_) => {
            info!("Closed context {} for user {}", context_id, user_id);
            Ok(HttpResponse::Ok().json(SuccessResponse {
                message: "Context closed successfully".to_string(),
            }))
        }
        Err(e) => {
            error!(
                "Failed to close context {} for user {}: {}",
                context_id, user_id, e
            );
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to close context: {}", e),
            }))
        }
    }
}

/// PUT /v1/session/:user_id/ui-state
/// Update UI state
pub async fn update_ui_state(
    path: Path<String>,
    req: Json<UpdateUIStateRequest>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let user_id = path.into_inner();

    match session_manager
        .update_ui_state(&user_id, &req.key, req.value.clone())
        .await
    {
        Ok(_) => {
            info!("Updated UI state for user {}: {}", user_id, req.key);
            Ok(HttpResponse::Ok().json(SuccessResponse {
                message: "UI state updated successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to update UI state for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to update UI state: {}", e),
            }))
        }
    }
}

/// PUT /v1/session/:user_id/preferences
/// Update user preferences
pub async fn update_preferences(
    path: Path<String>,
    req: Json<UpdatePreferencesRequest>,
    session_manager: Data<MultiUserSessionManager<FileSessionStorage>>,
) -> Result<HttpResponse> {
    let user_id = path.into_inner();

    // First, get the current session to retrieve existing preferences
    let current_session = match session_manager.get_session(&user_id).await {
        Ok(session) => session,
        Err(e) => {
            error!("Failed to get session for user {}: {}", user_id, e);
            return Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to get session: {}", e),
            }));
        }
    };

    // Merge with new values
    let new_preferences = UserPreferences {
        theme: req.theme.as_ref().map_or(current_session.preferences.theme, |t| {
            match t.as_str() {
                "light" => Theme::Light,
                "dark" => Theme::Dark,
                "auto" => Theme::Auto,
                _ => current_session.preferences.theme,
            }
        }),
        language: req.language.clone().unwrap_or(current_session.preferences.language),
        font_size: req.font_size.unwrap_or(current_session.preferences.font_size),
        auto_save: req.auto_save.unwrap_or(current_session.preferences.auto_save),
        default_model: req.default_model.clone().unwrap_or(current_session.preferences.default_model),
        tool_approval_policy: req.tool_approval_policy.as_ref().map_or(
            current_session.preferences.tool_approval_policy,
            |p| string_to_policy(p)
        ),
        code_theme: req.code_theme.clone().unwrap_or(current_session.preferences.code_theme),
        enable_shortcuts: req.enable_shortcuts.unwrap_or(current_session.preferences.enable_shortcuts),
        send_telemetry: req.send_telemetry.unwrap_or(current_session.preferences.send_telemetry),
    };

    match session_manager
        .update_preferences(&user_id, new_preferences)
        .await
    {
        Ok(_) => {
            info!("Updated preferences for user {}", user_id);
            Ok(HttpResponse::Ok().json(SuccessResponse {
                message: "Preferences updated successfully".to_string(),
            }))
        }
        Err(e) => {
            error!("Failed to update preferences for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ErrorResponse {
                error: format!("Failed to update preferences: {}", e),
            }))
        }
    }
}

/// Configure routes
pub fn config(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(
        actix_web::web::scope("/session")
            .route("/{user_id}", actix_web::web::get().to(get_session))
            .route(
                "/{user_id}/active-context",
                actix_web::web::post().to(set_active_context),
            )
            .route(
                "/{user_id}/active-context",
                actix_web::web::delete().to(clear_active_context),
            )
            .route(
                "/{user_id}/open-context",
                actix_web::web::post().to(open_context),
            )
            .route(
                "/{user_id}/context/{context_id}",
                actix_web::web::delete().to(close_context),
            )
            .route(
                "/{user_id}/ui-state",
                actix_web::web::put().to(update_ui_state),
            )
            .route(
                "/{user_id}/preferences",
                actix_web::web::put().to(update_preferences),
            ),
    );
}
