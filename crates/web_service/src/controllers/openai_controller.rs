use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use bytes::Bytes;
use copilot_client::api::models::{ChatCompletionRequest, ChatCompletionResponse};
use copilot_client::ProxyAuthRequiredError;
use futures_util::StreamExt;
use serde::Serialize;
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

#[get("/models")]
pub async fn get_models(app_state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
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
