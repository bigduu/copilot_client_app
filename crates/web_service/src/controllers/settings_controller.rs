use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use chat_core::paths::{config_json_path, workflows_dir};
use chat_core::ProxyAuth;
use serde::{Deserialize, Serialize};
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

fn config_path(_app_state: &AppState) -> PathBuf {
    config_json_path()
}

fn strip_proxy_auth(mut config: Value) -> Value {
    if let Some(obj) = config.as_object_mut() {
        obj.remove("proxy_auth");
        obj.remove("proxy_auth_encrypted");
    }
    config
}

/// Clean empty proxy fields from config
fn clean_empty_proxy_fields(mut config: Value) -> Value {
    if let Some(obj) = config.as_object_mut() {
        // Remove empty http_proxy
        if let Some(http_proxy) = obj.get("http_proxy") {
            if http_proxy.as_str().map_or(true, |s| s.is_empty()) {
                obj.remove("http_proxy");
            }
        }
        // Remove empty https_proxy
        if let Some(https_proxy) = obj.get("https_proxy") {
            if https_proxy.as_str().map_or(true, |s| s.is_empty()) {
                obj.remove("https_proxy");
            }
        }
    }
    config
}

/// Encrypt proxy auth before storing to config file
fn encrypt_proxy_auth(config: &mut Value) -> Result<(), AppError> {
    if let Some(obj) = config.as_object_mut() {
        // Encrypt proxy_auth
        if let Some(auth) = obj.get("proxy_auth").cloned() {
            if let Ok(auth_str) = serde_json::to_string(&auth) {
                match chat_core::encryption::encrypt(&auth_str) {
                    Ok(encrypted) => {
                        obj.insert(
                            "proxy_auth_encrypted".to_string(),
                            serde_json::Value::String(encrypted),
                        );
                        obj.remove("proxy_auth");
                    }
                    Err(e) => log::warn!("Failed to encrypt proxy_auth: {}", e),
                }
            }
        }
    }
    Ok(())
}

/// Decrypt proxy auth when loading from config file
fn decrypt_proxy_auth(config: &mut Value) {
    if let Some(obj) = config.as_object_mut() {
        // Decrypt proxy_auth
        if let Some(encrypted) = obj.get("proxy_auth_encrypted").and_then(|v| v.as_str()) {
            match chat_core::encryption::decrypt(encrypted) {
                Ok(decrypted) => {
                    if let Ok(auth) = serde_json::from_str::<serde_json::Value>(&decrypted) {
                        obj.insert("proxy_auth".to_string(), auth);
                    }
                }
                Err(e) => log::warn!("Failed to decrypt proxy_auth: {}", e),
            }
        }
    }
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

#[get("/bamboo/workflows")]
pub async fn list_workflows(_app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let dir = workflows_dir();

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

#[get("/bamboo/workflows/{name}")]
pub async fn get_workflow(
    _app_state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let name = path.into_inner();
    if !is_safe_workflow_name(&name) {
        return Err(AppError::NotFound("Workflow".to_string()));
    }

    let dir = workflows_dir();
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

#[get("/bamboo/config")]
pub async fn get_bamboo_config(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    match fs::read_to_string(&path).await {
        Ok(content) => {
            let mut config = serde_json::from_str::<Value>(&content)?;
            // Decrypt proxy auth for internal use, but strip before returning to client
            decrypt_proxy_auth(&mut config);
            Ok(HttpResponse::Ok().json(strip_proxy_auth(config.clone())))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            Ok(HttpResponse::Ok().json(serde_json::json!({})))
        }
        Err(err) => Err(AppError::StorageError(err)),
    }
}

#[post("/bamboo/config")]
pub async fn set_bamboo_config(
    app_state: web::Data<AppState>,
    payload: web::Json<Value>,
) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Preserve existing encrypted proxy auth field before processing
    let existing_encrypted_auth = fs::read_to_string(&path).await.ok().and_then(|content| {
        let existing: Value = serde_json::from_str(&content).ok()?;
        existing.get("proxy_auth_encrypted").cloned()
    });

    let config = strip_proxy_auth(payload.into_inner());
    let mut config = clean_empty_proxy_fields(config);

    // Restore encrypted proxy auth field if it existed
    if let Some(encrypted_val) = existing_encrypted_auth {
        if let Some(obj) = config.as_object_mut() {
            obj.insert("proxy_auth_encrypted".to_string(), encrypted_val);
        }
    }

    let content = serde_json::to_string_pretty(&config)?;
    fs::write(path, content).await?;
    Ok(HttpResponse::Ok().json(config))
}

#[derive(Deserialize)]
struct ProxyAuthPayload {
    username: Option<String>,
    password: Option<String>,
}

#[post("/bamboo/proxy-auth")]
pub async fn set_proxy_auth(
    app_state: web::Data<AppState>,
    payload: web::Json<ProxyAuthPayload>,
) -> Result<HttpResponse, AppError> {
    let username = payload.username.clone().unwrap_or_default();
    let password = payload.password.clone().unwrap_or_default();
    let auth = if username.trim().is_empty() {
        None
    } else {
        Some(ProxyAuth { username, password })
    };
    app_state
        .copilot_client
        .update_proxy_auth(auth)
        .await
        .map_err(|e| {
            AppError::InternalError(anyhow::anyhow!("Failed to update proxy auth: {e}"))
        })?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

#[get("/bamboo/proxy-auth/status")]
pub async fn get_proxy_auth_status(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);

    if !path.exists() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "configured": false,
            "username": serde_json::Value::Null
        })));
    }

    let content = fs::read_to_string(&path).await?;
    let config: serde_json::Value = serde_json::from_str(&content)?;

    // Check for encrypted proxy auth
    if let Some(encrypted) = config.get("proxy_auth_encrypted").and_then(|v| v.as_str()) {
        match chat_core::encryption::decrypt(encrypted) {
            Ok(decrypted) => {
                if let Ok(auth) = serde_json::from_str::<chat_core::ProxyAuth>(&decrypted) {
                    return Ok(HttpResponse::Ok().json(serde_json::json!({
                        "configured": true,
                        "username": auth.username
                    })));
                }
            }
            Err(e) => log::warn!("Failed to decrypt proxy auth: {}", e),
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "configured": false,
        "username": serde_json::Value::Null
    })))
}

#[post("/bamboo/config/reset")]
pub async fn reset_bamboo_config(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);
    // Try to delete config.json if it exists
    match fs::try_exists(&path).await {
        Ok(true) => {
            fs::remove_file(&path).await.map_err(AppError::StorageError)?;
        }
        Ok(false) => {
            // Config file doesn't exist, nothing to do
        }
        Err(err) => return Err(AppError::StorageError(err)),
    }
    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

#[get("/bamboo/anthropic-model-mapping")]
pub async fn get_anthropic_model_mapping(
    _app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    use crate::services::anthropic_model_mapping_service::load_anthropic_model_mapping;
    let mapping = load_anthropic_model_mapping().await?;
    Ok(HttpResponse::Ok().json(mapping))
}

#[post("/bamboo/anthropic-model-mapping")]
pub async fn set_anthropic_model_mapping(
    _app_state: web::Data<AppState>,
    payload: web::Json<crate::services::anthropic_model_mapping_service::AnthropicModelMapping>,
) -> Result<HttpResponse, AppError> {
    use crate::services::anthropic_model_mapping_service::save_anthropic_model_mapping;
    let mapping = save_anthropic_model_mapping(payload.into_inner()).await?;
    Ok(HttpResponse::Ok().json(mapping))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(list_workflows)
        .service(get_workflow)
        .service(get_bamboo_config)
        .service(set_bamboo_config)
        .service(reset_bamboo_config)
        .service(set_proxy_auth)
        .service(get_proxy_auth_status)
        .service(get_anthropic_model_mapping)
        .service(set_anthropic_model_mapping);
}
