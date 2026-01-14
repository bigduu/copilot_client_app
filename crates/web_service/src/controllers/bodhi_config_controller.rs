use actix_web::{get, put, web, HttpResponse};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

use crate::error::AppError;
use crate::services::anthropic_model_mapping_service::{
    load_anthropic_model_mapping, save_anthropic_model_mapping, AnthropicModelMapping,
};

#[derive(Serialize)]
struct SystemPromptsResponse {
    prompts: Vec<Value>,
}

#[derive(Serialize)]
struct ToolsResponse {
    tools: Vec<Value>,
}

#[derive(Serialize)]
struct WorkflowMetadata {
    name: String,
    filename: String,
    size: u64,
    modified_at: Option<String>,
}

#[derive(Serialize)]
struct WorkflowContentResponse {
    name: String,
    content: String,
    filename: String,
    size: u64,
    modified_at: Option<String>,
}

fn bodhi_config_dir() -> Result<PathBuf, AppError> {
    let home = std::env::var_os("HOME")
        .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("HOME not set")))?;
    Ok(PathBuf::from(home).join(".bodhi"))
}

fn bodhi_workflow_dir() -> Result<PathBuf, AppError> {
    Ok(bodhi_config_dir()?.join("workflows"))
}

async fn read_json(path: PathBuf) -> Result<Option<Value>, AppError> {
    match fs::read_to_string(&path).await {
        Ok(content) => Ok(Some(serde_json::from_str::<Value>(&content)?)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(AppError::StorageError(err)),
    }
}

fn extract_array(value: Option<Value>, key: &str) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => items,
        Some(Value::Object(map)) => map
            .get(key)
            .and_then(|val| val.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn format_modified(metadata: &std::fs::Metadata) -> Option<String> {
    metadata
        .modified()
        .ok()
        .map(|time| DateTime::<Utc>::from(time).to_rfc3339())
}

#[get("/bodhi/system-prompts")]
pub async fn list_system_prompts() -> Result<HttpResponse, AppError> {
    let dir = bodhi_config_dir()?;
    let path = dir.join("system_prompt.json");
    let data = read_json(path).await?;
    let prompts = extract_array(data, "prompts");

    Ok(HttpResponse::Ok().json(SystemPromptsResponse { prompts }))
}

#[get("/bodhi/tools")]
pub async fn list_tools() -> Result<HttpResponse, AppError> {
    let dir = bodhi_config_dir()?;
    let path = dir.join("tools.json");
    let data = read_json(path).await?;
    let tools = extract_array(data, "tools");

    Ok(HttpResponse::Ok().json(ToolsResponse { tools }))
}

#[get("/bodhi/workflows")]
pub async fn list_workflows() -> Result<HttpResponse, AppError> {
    let dir = bodhi_workflow_dir()?;
    let mut entries = match fs::read_dir(&dir).await {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(HttpResponse::Ok().json(Vec::<WorkflowMetadata>::new()))
        }
        Err(err) => return Err(AppError::StorageError(err)),
    };

    let mut workflows = Vec::new();
    loop {
        let entry = match entries.next_entry().await {
            Ok(Some(entry)) => entry,
            Ok(None) => break,
            Err(err) => return Err(AppError::StorageError(err)),
        };
        let path = entry.path();
        if !is_markdown_file(&path) {
            continue;
        }

        let name = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let filename = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if filename.is_empty() {
            continue;
        }

        let metadata = entry.metadata().await.map_err(AppError::StorageError)?;
        workflows.push(WorkflowMetadata {
            name,
            filename,
            size: metadata.len(),
            modified_at: format_modified(&metadata),
        });
    }

    workflows.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(HttpResponse::Ok().json(workflows))
}

#[get("/bodhi/workflows/{name}")]
pub async fn get_workflow(path: web::Path<String>) -> Result<HttpResponse, AppError> {
    let name = path.into_inner();
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(AppError::NotFound(name));
    }

    let dir = bodhi_workflow_dir()?;
    let file_name = if name.ends_with(".md") {
        name.clone()
    } else {
        format!("{}.md", name)
    };
    let path = dir.join(&file_name);
    let content = match fs::read_to_string(&path).await {
        Ok(content) => content,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::NotFound(file_name))
        }
        Err(err) => return Err(AppError::StorageError(err)),
    };
    let metadata = fs::metadata(&path).await.map_err(AppError::StorageError)?;
    let display_name = Path::new(&file_name)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| name.clone());

    Ok(HttpResponse::Ok().json(WorkflowContentResponse {
        name: display_name,
        content,
        filename: file_name,
        size: metadata.len(),
        modified_at: format_modified(&metadata),
    }))
}

#[get("/bodhi/anthropic-model-mapping")]
pub async fn get_anthropic_model_mapping() -> Result<HttpResponse, AppError> {
    let mapping = load_anthropic_model_mapping().await?;
    Ok(HttpResponse::Ok().json(mapping))
}

#[put("/bodhi/anthropic-model-mapping")]
pub async fn update_anthropic_model_mapping(
    payload: web::Json<AnthropicModelMapping>,
) -> Result<HttpResponse, AppError> {
    let mapping = save_anthropic_model_mapping(payload.into_inner()).await?;
    Ok(HttpResponse::Ok().json(mapping))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(list_system_prompts)
        .service(list_tools)
        .service(list_workflows)
        .service(get_workflow)
        .service(get_anthropic_model_mapping)
        .service(update_anthropic_model_mapping);
}
