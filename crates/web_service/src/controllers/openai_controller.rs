use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use agent_llm::api::models::{ChatCompletionRequest, ChatCompletionResponse};
use agent_llm::ProxyAuthRequiredError;
use bytes::Bytes;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

#[derive(Serialize)]
struct ListModelsResponse {
    object: String,
    data: Vec<Model>,
}

#[derive(Serialize)]
struct Model {
    id: String,
    object: String,
    created: u64,
    owned_by: String,
}

#[derive(Deserialize)]
struct CopilotTokenConfig {
    token: String,
    expires_at: u64,
    #[allow(dead_code)]
    annotations_enabled: bool,
    #[allow(dead_code)]
    chat_enabled: bool,
}

/// Check if we have valid authentication before triggering device flow
/// Returns true if auth is available (via env var or valid token files)
fn has_valid_auth(app_data_dir: &Path) -> bool {
    // Check for COPILOT_API_KEY environment variable first
    if std::env::var("COPILOT_API_KEY")
        .ok()
        .and_then(|k| Some(!k.trim().is_empty()))
        .unwrap_or(false)
    {
        log::info!("COPILOT_API_KEY is set, auth available");
        return true;
    }

    let token_path = app_data_dir.join(".token");
    let copilot_token_path = app_data_dir.join(".copilot_token.json");

    // Check .copilot_token.json first (cached config with expiry)
    if copilot_token_path.exists() {
        match std::fs::read_to_string(&copilot_token_path) {
            Ok(content) => {
                // Try to parse and validate the token
                if let Ok(config) = serde_json::from_str::<CopilotTokenConfig>(&content) {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    // Add 60 second buffer to match token validation logic
                    if config.expires_at.saturating_sub(60) > now {
                        log::info!("Valid cached copilot token found, auth available");
                        return true;
                    } else {
                        log::info!("Cached copilot token expired, will trigger auth if needed");
                        // Remove expired token file
                        let _ = std::fs::remove_file(&copilot_token_path);
                    }
                } else {
                    log::warn!("Failed to parse .copilot_token.json, will re-authenticate");
                    // Remove invalid token file
                    let _ = std::fs::remove_file(&copilot_token_path);
                }
            }
            Err(e) => {
                log::error!("Failed to read .copilot_token.json: {}", e);
                // Continue to check .token file
            }
        }
    }

    // Check .token file (access token for exchange)
    if token_path.exists() {
        match std::fs::read_to_string(&token_path) {
            Ok(content) => {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    log::info!("Valid .token file found, auth available");
                    true
                } else {
                    log::info!(".token file is empty, auth not available");
                    false
                }
            }
            Err(e) => {
                log::error!("Failed to read .token file: {}", e);
                false
            }
        }
    } else {
        log::info!("No token files found, auth not available");
        false
    }
}

#[get("/models")]
pub async fn get_models(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    // Check if we have valid authentication before triggering any auth flow
    if !has_valid_auth(&app_state.app_data_dir) {
        log::info!("No valid authentication found (no env var or valid token files), returning empty model list");
        return Ok(HttpResponse::Ok().json(ListModelsResponse {
            object: "list".to_string(),
            data: vec![],
        }));
    }

    // Fetch real models from copilot_client
    let model_ids = match app_state.copilot_client.get_models().await {
        Ok(model_ids) => model_ids,
        Err(e) => {
            if e.downcast_ref::<ProxyAuthRequiredError>().is_some() {
                return Err(AppError::ProxyAuthRequired);
            }
            return Err(AppError::InternalError(anyhow::anyhow!(
                "Failed to fetch models: {}",
                e
            )));
        }
    };

    // Convert model IDs to OpenAI-compatible format
    let models: Vec<Model> = model_ids
        .into_iter()
        .map(|id| Model {
            id,
            object: "model".to_string(),
            created: 1677610602, // Use a fixed timestamp for compatibility
            owned_by: "github-copilot".to_string(),
        })
        .collect();

    let response = ListModelsResponse {
        object: "list".to_string(),
        data: models,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[post("/chat/completions")]
pub async fn chat_completions(
    app_state: web::Data<AppState>,
    req: web::Json<ChatCompletionRequest>,
) -> Result<HttpResponse, AppError> {
    let stream = req.stream.unwrap_or(false);
    let request = req.into_inner();

    if stream {
        let (tx, rx) = mpsc::channel(10);
        let client = app_state.copilot_client.clone();

        let response = match client.send_chat_completion_request(request).await {
            Ok(resp) => resp,
            Err(e) => {
                if e.downcast_ref::<ProxyAuthRequiredError>().is_some() {
                    return Err(AppError::ProxyAuthRequired);
                }
                return Err(AppError::InternalError(e));
            }
        };

        if response.status().as_u16() == 407 {
            return Err(AppError::ProxyAuthRequired);
        }

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let error_message = format!("Upstream API error. Status: {}, Body: {}", status, body);
            return Err(AppError::InternalError(anyhow::anyhow!(error_message)));
        }

        // Spawn a task to handle the streaming response
        tokio::spawn(async move {
            if let Err(e) = client.process_chat_completion_stream(response, tx).await {
                log::error!("Failed to process stream: {}", e);
            }
        });

        let stream = ReceiverStream::new(rx).map(|res| {
            res.map(|bytes| {
                let s = std::str::from_utf8(&bytes).unwrap_or_default();
                let data = format!("data: {}\n\n", s);
                Bytes::from(data)
            })
            .map_err(AppError::InternalError)
        });

        Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(stream))
    } else {
        let response = match app_state
            .copilot_client
            .send_chat_completion_request(request)
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                if e.downcast_ref::<ProxyAuthRequiredError>().is_some() {
                    return Err(AppError::ProxyAuthRequired);
                }
                return Err(AppError::InternalError(e));
            }
        };

        let status = response.status();
        if status.as_u16() == 407 {
            return Err(AppError::ProxyAuthRequired);
        }

        let body = response.bytes().await.map_err(|e| {
            AppError::InternalError(anyhow::anyhow!("Failed to read response body: {}", e))
        })?;

        if !status.is_success() {
            let error_message = format!(
                "Upstream API error. Status: {}, Body: {}",
                status,
                String::from_utf8_lossy(&body)
            );
            return Err(AppError::InternalError(anyhow::anyhow!(error_message)));
        }

        let completion = serde_json::from_slice::<ChatCompletionResponse>(&body).map_err(|e| {
            AppError::InternalError(anyhow::anyhow!("Failed to parse response: {}", e))
        })?;

        Ok(HttpResponse::Ok().json(completion))
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(get_models).service(chat_completions);
}
