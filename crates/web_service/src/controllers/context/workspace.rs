//! Workspace management domain
//!
//! This module handles all workspace-related operations:
//! - Attaching/detaching workspace paths to contexts
//! - Listing workspace files
//! - Workspace path validation

use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    get, put,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::error;
use serde::{Deserialize, Serialize};
use std::{fs, path::Path as FsPath};
use uuid::Uuid;

// ============================================================================
// Types for workspace domain
// ============================================================================

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

// ============================================================================
// Handlers
// ============================================================================

/// Attach a workspace path to a context
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

/// Get the workspace path for a context
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
            let workspace_path = {
                let ctx = context.read().await;
                ctx.config.workspace_path.clone()
            };

            Ok(HttpResponse::Ok().json(WorkspaceInfoResponse { workspace_path }))
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!("Failed to load context: {}", err);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}

/// List files in the workspace directory
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
            let workspace_path = {
                let ctx = context.read().await;
                ctx.config.workspace_path.clone()
            };

            match workspace_path {
                Some(ws_path) => {
                    let path_obj = FsPath::new(&ws_path);
                    match fs::read_dir(path_obj) {
                        Ok(entries) => {
                            let mut files = Vec::new();
                            for entry_result in entries {
                                if let Ok(entry) = entry_result {
                                    if let Ok(metadata) = entry.metadata() {
                                        if let Some(name) = entry.file_name().to_str() {
                                            files.push(WorkspaceFileEntry {
                                                name: name.to_string(),
                                                path: entry.path().to_string_lossy().to_string(),
                                                is_directory: metadata.is_dir(),
                                            });
                                        }
                                    }
                                }
                            }

                            files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
                                (true, false) => std::cmp::Ordering::Less,
                                (false, true) => std::cmp::Ordering::Greater,
                                _ => a.name.cmp(&b.name),
                            });

                            Ok(HttpResponse::Ok().json(WorkspaceFilesResponse {
                                workspace_path: ws_path,
                                files,
                            }))
                        }
                        Err(err) => {
                            error!("Failed to read workspace directory: {}", err);
                            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                                "error": format!("Failed to read workspace: {}", err)
                            })))
                        }
                    }
                }
                None => Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "No workspace path configured for this context"
                }))),
            }
        }
        Ok(None) => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Context not found"
        }))),
        Err(err) => {
            error!("Failed to load context: {}", err);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })))
        }
    }
}
