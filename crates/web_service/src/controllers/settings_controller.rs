use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use chat_core::paths::{config_json_path, workflows_dir};
use chat_core::ProxyAuth;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tokio::fs;

use agent_llm::AVAILABLE_PROVIDERS;

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

    // Store proxy auth in config
    let auth = if username.trim().is_empty() {
        None
    } else {
        Some(ProxyAuth { username, password })
    };

    // Update config file
    let path = config_path(&app_state);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Read existing config
    let mut config_value: Value = match fs::read_to_string(&path).await {
        Ok(content) => {
            let mut config: Value = serde_json::from_str(&content)?;
            decrypt_proxy_auth(&mut config);
            config
        }
        Err(_) => serde_json::json!({}),
    };

    // Update proxy auth
    if let Some(obj) = config_value.as_object_mut() {
        if let Some(auth) = auth {
            obj.insert("proxy_auth".to_string(), serde_json::to_value(&auth)?);
        } else {
            obj.remove("proxy_auth");
            obj.remove("proxy_auth_encrypted");
        }
    }

    // Encrypt and save
    let mut config_to_save = config_value.clone();
    encrypt_proxy_auth(&mut config_to_save)?;
    let content = serde_json::to_string_pretty(&config_to_save)?;
    fs::write(&path, content).await?;

    // Reload provider to apply new proxy settings
    app_state.reload_provider().await.map_err(|e| {
        AppError::InternalError(anyhow::anyhow!("Failed to reload provider after updating proxy auth: {e}"))
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

// Provider configuration endpoints

#[derive(Serialize)]
struct ProviderConfigResponse {
    provider: String,
    available_providers: Vec<String>,
    config: Value,
}

#[derive(Deserialize)]
struct UpdateProviderRequest {
    provider: String,
    #[serde(default)]
    providers: Value,
}

/// Get current provider configuration
#[get("/bamboo/settings/provider")]
pub async fn get_provider_config(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);

    let config_value = match fs::read_to_string(&path).await {
        Ok(content) => {
            let mut config: Value = serde_json::from_str(&content)?;
            decrypt_proxy_auth(&mut config);
            config
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            // Return default config if file doesn't exist
            serde_json::json!({
                "provider": "copilot",
                "providers": {}
            })
        }
        Err(err) => return Err(AppError::StorageError(err)),
    };

    let provider = config_value
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("copilot")
        .to_string();

    // Get providers config (mask API keys for security)
    let providers = config_value
        .get("providers")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    // Mask API keys in the response
    let masked_providers = mask_api_keys_in_providers(&providers);

    let response = ProviderConfigResponse {
        provider,
        available_providers: AVAILABLE_PROVIDERS.iter().map(|s| s.to_string()).collect(),
        config: masked_providers,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Mask API keys in provider config for security
fn mask_api_keys_in_providers(providers: &Value) -> Value {
    let mut masked = providers.clone();

    if let Some(obj) = masked.as_object_mut() {
        for (_, provider_config) in obj.iter_mut() {
            if let Some(config_obj) = provider_config.as_object_mut() {
                if let Some(api_key) = config_obj.get_mut("api_key") {
                    if let Some(key_str) = api_key.as_str() {
                        if key_str.len() > 8 {
                            let masked_key = format!(
                                "{}...{}",
                                &key_str[..4],
                                &key_str[key_str.len() - 4..]
                            );
                            *api_key = Value::String(masked_key);
                        } else if !key_str.is_empty() {
                            *api_key = Value::String("***".to_string());
                        }
                    }
                }
            }
        }
    }

    masked
}

/// Update provider configuration
#[post("/bamboo/settings/provider")]
pub async fn update_provider_config(
    app_state: web::Data<AppState>,
    payload: web::Json<UpdateProviderRequest>,
) -> Result<HttpResponse, AppError> {
    let path = config_path(&app_state);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Read existing config
    let mut existing_config: Value = match fs::read_to_string(&path).await {
        Ok(content) => {
            let mut config: Value = serde_json::from_str(&content)?;
            decrypt_proxy_auth(&mut config);
            config
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            serde_json::json!({})
        }
        Err(err) => return Err(AppError::StorageError(err)),
    };

    // Update provider
    if let Some(obj) = existing_config.as_object_mut() {
        obj.insert("provider".to_string(), Value::String(payload.provider.clone()));

        // Merge providers config
        if let Some(existing_providers) = obj.get_mut("providers") {
            if let Some(existing_obj) = existing_providers.as_object_mut() {
                if let Some(new_providers) = payload.providers.as_object() {
                    for (key, value) in new_providers.iter() {
                        // Don't overwrite with masked values
                        if let Some(new_obj) = value.as_object() {
                            if let Some(api_key) = new_obj.get("api_key") {
                                if let Some(key_str) = api_key.as_str() {
                                    if key_str.contains("***") || key_str.contains("...") {
                                        // This is a masked key, preserve the existing one
                                        if let Some(existing_provider) = existing_obj.get(key) {
                                            if let Some(existing_key) = existing_provider.get("api_key") {
                                                let mut merged = value.clone();
                                                if let Some(merged_obj) = merged.as_object_mut() {
                                                    merged_obj.insert("api_key".to_string(), existing_key.clone());
                                                }
                                                existing_obj.insert(key.clone(), merged);
                                                continue;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        existing_obj.insert(key.clone(), value.clone());
                    }
                }
            } else {
                obj.insert("providers".to_string(), payload.providers.clone());
            }
        } else {
            obj.insert("providers".to_string(), payload.providers.clone());
        }
    }

    // Clean empty proxy fields
    let mut config_to_save = clean_empty_proxy_fields(existing_config.clone());

    // Encrypt proxy auth if present
    encrypt_proxy_auth(&mut config_to_save)?;

    // Save to file
    let content = serde_json::to_string_pretty(&config_to_save)?;
    fs::write(&path, content).await?;

    log::info!("Provider configuration updated to: {}", payload.provider);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "provider": payload.provider
    })))
}

/// Reload configuration and recreate provider
#[post("/bamboo/settings/reload")]
pub async fn reload_provider_config(
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    // Reload the configuration
    let new_config = chat_core::Config::new();

    // Validate the configuration
    if let Err(e) = agent_llm::validate_provider_config(&new_config) {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "error": e.to_string()
        })));
    }

    // Reload the provider in AppState
    if let Err(e) = app_state.reload_provider().await {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "error": format!("Failed to reload provider: {}", e)
        })));
    }

    log::info!("Provider reloaded successfully: {}", new_config.provider);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "provider": new_config.provider
    })))
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
        .service(set_anthropic_model_mapping)
        // Provider configuration endpoints
        .service(get_provider_config)
        .service(update_provider_config)
        .service(reload_provider_config);
}
