use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use tokio::fs;

#[derive(Serialize)]
struct WorkflowListItem {
    name: String,
    filename: String,
    size: u64,
    modified_at: Option<String>,
}

#[derive(Serialize)]
struct WorkflowGetResponse {
    name: String,
    filename: String,
    content: String,
    size: u64,
    modified_at: Option<String>,
}

fn workflows_dir() -> Result<PathBuf, AppError> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("HOME not set")))?;
    Ok(PathBuf::from(home).join(".bodhi").join("workflows"))
}

fn config_path(app_state: &AppState) -> PathBuf {
    app_state.app_data_dir.join("config.json")
}

fn is_safe_workflow_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return false;
    }
    true
}

#[get("/bodhi/workflows")]
pub async fn list_workflows(_app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let dir = workflows_dir()?;

    fs::create_dir_all(&dir).await?;

    let mut entries = fs::read_dir(&dir).await?;
    let mut workflows: Vec<WorkflowListItem> = Vec::new();

    while let Some(entry) = entries.next_entry().await? {
        let file_type = entry.file_type().await?;
        if !file_type.is_file() {
            continue;
        }

        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };

        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();

        let metadata = entry.metadata().await?;
        workflows.push(WorkflowListItem {
            name: stem.to_string(),
            filename,
            size: metadata.len(),
            modified_at: None,
        });
    }

    workflows.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(HttpResponse::Ok().json(workflows))
}

#[get("/bodhi/workflows/{name}")]
pub async fn get_workflow(
    _app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let name = path.into_inner();
    if !is_safe_workflow_name(&name) {
        return Err(AppError::NotFound("Workflow".to_string()));
    }

    let dir = workflows_dir()?;
    fs::create_dir_all(&dir).await?;

    let filename = format!("{name}.md");
    let file_path = dir.join(&filename);

    let metadata = match fs::metadata(&file_path).await {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::NotFound(format!("Workflow '{name}'")))
        }
        Err(e) => return Err(AppError::StorageError(e)),
    };

    let content = fs::read_to_string(&file_path).await?;

    Ok(HttpResponse::Ok().json(WorkflowGetResponse {
        name,
        filename,
        content,
        size: metadata.len(),
        modified_at: None,
    }))
}

#[get("/bodhi/config")]
pub async fn get_bodhi_config(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    match fs::read_to_string(&path).await {
        Ok(content) => {
            let config = serde_json::from_str::<Value>(&content)?;
            Ok(HttpResponse::Ok().json(config))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Ok(HttpResponse::Ok().json(serde_json::json!({})))
        }
        Err(err) => Err(AppError::StorageError(err)),
    }
}

#[post("/bodhi/config")]
pub async fn set_bodhi_config(
    app_state: web::Data<AppState>,
    payload: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let config = payload.into_inner();
    let content = serde_json::to_string_pretty(&config)?;
    fs::write(path, content).await?;
    Ok(HttpResponse::Ok().json(config))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(list_workflows)
        .service(get_workflow)
        .service(get_bodhi_config)
        .service(set_bodhi_config);
}
