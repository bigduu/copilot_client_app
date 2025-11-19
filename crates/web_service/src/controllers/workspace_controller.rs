use crate::server::AppState;
use crate::workspace_service::{AddRecentRequest, ValidatePathRequest, WorkspaceService};
use actix_web::{web, web::Data, web::Json, HttpResponse};
use log::error;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/workspace")
            .route("/validate", web::post().to(validate_workspace_path))
            .route("/recent", web::get().to(get_recent_workspaces))
            .route("/recent", web::post().to(add_recent_workspace))
            .route("/suggestions", web::get().to(get_path_suggestions))
            .route("/pick-folder", web::post().to(pick_folder))
            .route("/browse-folder", web::post().to(browse_folder)),
    );
}

async fn validate_workspace_path(
    app_state: Data<AppState>,
    payload: Json<ValidatePathRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let workspace_service = WorkspaceService::new(app_state.app_data_dir.clone());

    match workspace_service.validate_path(&payload.path).await {
        Ok(workspace_info) => Ok(HttpResponse::Ok().json(workspace_info)),
        Err(e) => {
            error!("Error validating workspace path '{}': {}", payload.path, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to validate workspace path",
                "details": e.to_string()
            })))
        }
    }
}

async fn get_recent_workspaces(
    app_state: Data<AppState>,
) -> Result<HttpResponse, actix_web::Error> {
    let workspace_service = WorkspaceService::new(app_state.app_data_dir.clone());

    match workspace_service.get_recent_workspaces().await {
        Ok(recent_workspaces) => Ok(HttpResponse::Ok().json(recent_workspaces)),
        Err(e) => {
            error!("Error getting recent workspaces: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to get recent workspaces",
                "details": e.to_string()
            })))
        }
    }
}

async fn add_recent_workspace(
    app_state: Data<AppState>,
    payload: Json<AddRecentRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let workspace_service = WorkspaceService::new(app_state.app_data_dir.clone());

    match workspace_service
        .add_recent_workspace(&payload.path, payload.metadata.clone())
        .await
    {
        Ok(()) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": "Workspace added to recent workspaces"
        }))),
        Err(e) => {
            error!("Error adding recent workspace '{}': {}", payload.path, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to add recent workspace",
                "details": e.to_string()
            })))
        }
    }
}

async fn get_path_suggestions(app_state: Data<AppState>) -> Result<HttpResponse, actix_web::Error> {
    let workspace_service = WorkspaceService::new(app_state.app_data_dir.clone());

    match workspace_service.get_path_suggestions().await {
        Ok(suggestions) => Ok(HttpResponse::Ok().json(suggestions)),
        Err(e) => {
            error!("Error getting path suggestions: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to get path suggestions",
                "details": e.to_string()
            })))
        }
    }
}

async fn pick_folder(_app_state: Data<AppState>) -> Result<HttpResponse, actix_web::Error> {
    // Deprecated: Use /browse-folder instead for unified folder browsing experience
    let common_dirs = get_common_workspace_directories();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "info",
        "message": "请使用文件夹浏览功能选择工作区路径。",
        "common_directories": common_dirs,
        "hint": "建议使用 /browse-folder API 获得更好的浏览体验"
    })))
}

#[derive(serde::Deserialize)]
struct BrowseFolderRequest {
    path: Option<String>,
}

#[derive(serde::Serialize)]
struct FolderItem {
    name: String,
    path: String,
}

async fn browse_folder(
    _app_state: Data<AppState>,
    payload: Json<BrowseFolderRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    use std::path::PathBuf;

    // Determine the starting path
    let current_path = if let Some(ref path) = payload.path {
        PathBuf::from(path)
    } else {
        // Default to user's home directory
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    };

    // Validate path exists and is a directory
    if !current_path.exists() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "路径不存在",
            "path": current_path.to_string_lossy()
        })));
    }

    if !current_path.is_dir() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "路径不是文件夹",
            "path": current_path.to_string_lossy()
        })));
    }

    // Read directory contents
    let mut folders = Vec::new();
    match std::fs::read_dir(&current_path) {
        Ok(entries) => {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        // Skip hidden folders (starting with .)
                        if !name.starts_with('.') {
                            folders.push(FolderItem {
                                name: name.to_string(),
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
        Err(e) => {
            error!("Error reading directory {:?}: {}", current_path, e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "无法读取文件夹",
                "details": e.to_string()
            })));
        }
    }

    // Sort folders alphabetically
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    // Get parent path for navigation
    let parent_path = current_path
        .parent()
        .map(|p| p.to_string_lossy().to_string());

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "current_path": current_path.to_string_lossy(),
        "parent_path": parent_path,
        "folders": folders
    })))
}

fn get_common_workspace_directories() -> Vec<String> {
    let mut dirs = Vec::new();

    // Add home directory based workspace paths
    if let Some(home_dir) = dirs::home_dir() {
        let home_str = home_dir.to_string_lossy();

        #[cfg(target_os = "macos")]
        {
            dirs.push(format!("{}/Projects", home_str));
            dirs.push(format!("{}/Workspace", home_str));
            dirs.push(format!("{}/Documents", home_str));
            dirs.push(format!("{}/Desktop", home_str));
            dirs.push(format!("{}/Development", home_str));
        }

        #[cfg(target_os = "windows")]
        {
            dirs.push(format!("{}\\Projects", home_str));
            dirs.push(format!("{}\\Workspace", home_str));
            dirs.push(format!("{}\\Documents", home_str));
            dirs.push(format!("{}\\Desktop", home_str));
            dirs.push("C:\\Projects".to_string());
            dirs.push("D:\\Projects".to_string());
        }

        #[cfg(target_os = "linux")]
        {
            dirs.push(format!("{}/Projects", home_str));
            dirs.push(format!("{}/workspace", home_str));
            dirs.push(format!("{}/Documents", home_str));
            dirs.push(format!("{}/dev", home_str));
            dirs.push("/home/projects".to_string());
        }
    }

    // Add current directory if accessible
    if let Ok(current_dir) = std::env::current_dir() {
        dirs.push(current_dir.to_string_lossy().to_string());
    }

    // Add parent directories
    if let Ok(current_dir) = std::env::current_dir() {
        if let Some(parent) = current_dir.parent() {
            dirs.push(parent.to_string_lossy().to_string());
        }
        if let Some(grandparent) = current_dir.parent().and_then(|p| p.parent()) {
            dirs.push(grandparent.to_string_lossy().to_string());
        }
    }

    dirs.sort();
    dirs.dedup();
    dirs
}
