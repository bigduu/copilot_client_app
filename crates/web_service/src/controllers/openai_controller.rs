use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse, Responder};
use bytes::Bytes;
use copilot_client::api::models::{ChatCompletionRequest, ChatCompletionResponse};
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
pub async fn get_models() -> impl Responder {
    // In the future, this could come from a config file or a dynamic source.
    let models = vec![
        Model {
            id: "gpt-4".to_string(),
            object: "model".to_string(),
            created: 1677610602,
            owned_by: "openai".to_string(),
        },
        Model {
            id: "gpt-3.5-turbo".to_string(),
            object: "model".to_string(),
            created: 1677610602,
            owned_by: "openai".to_string(),
        },
    ];

    let response = ListModelsResponse {
        object: "list".to_string(),
        data: models,
    };

    HttpResponse::Ok().json(response)
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

        let response = client.send_chat_completion_request(request).await?;

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
        let response = app_state
            .copilot_client
            .send_chat_completion_request(request)
            .await?;

        let status = response.status();
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
