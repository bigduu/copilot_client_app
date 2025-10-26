use actix_web::{web, HttpResponse, Result};
use anyhow;
use log::{error, info};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::models::{
    OpenAIChatCompletionRequest, OpenAIChatCompletionResponse, OpenAIChoice, OpenAIContent,
    OpenAIDelta, OpenAIError, OpenAIErrorDetail, OpenAIMessage, OpenAIModel, OpenAIModelsResponse,
    OpenAIStreamChunk, OpenAIUsage,
};
use crate::server::AppState;

/// Helper function to create error response while preserving original error format
fn create_error_response(error: &anyhow::Error, fallback_message: &str) -> HttpResponse {
    let error_str = error.to_string();

    // Check if the error contains structured JSON error information
    if let Ok(parsed_error) = serde_json::from_str::<serde_json::Value>(&error_str) {
        // If it's already valid JSON, return it as-is with proper HTTP status
        return HttpResponse::BadRequest().json(parsed_error);
    }

    // Check if it's an HTTP error with embedded JSON
    if error_str.contains("HTTP") && error_str.contains("error:") {
        if let Some(body_start) = error_str.find("error: ") {
            let body_part = &error_str[body_start + 7..];
            if let Ok(parsed_body) = serde_json::from_str::<serde_json::Value>(body_part) {
                // Extract HTTP status code if available
                let status_code = if error_str.contains("HTTP 400") {
                    400
                } else if error_str.contains("HTTP 401") {
                    401
                } else if error_str.contains("HTTP 403") {
                    403
                } else if error_str.contains("HTTP 404") {
                    404
                } else if error_str.contains("HTTP 429") {
                    429
                } else if error_str.contains("HTTP 500") {
                    500
                } else {
                    400 // Default to bad request
                };

                return HttpResponse::build(
                    actix_web::http::StatusCode::from_u16(status_code)
                        .unwrap_or(actix_web::http::StatusCode::BAD_REQUEST),
                )
                .json(parsed_body);
            }
        }
    }

    // Fallback to standard error format
    HttpResponse::InternalServerError().json(OpenAIError {
        error: OpenAIErrorDetail {
            message: format!("{}: {}", fallback_message, error_str),
            error_type: "forwarded_error".to_string(),
            code: None,
        },
    })
}

pub async fn chat_completions(
    req: web::Json<OpenAIChatCompletionRequest>,
    _app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    info!("Received chat completion request for model: {}", req.model);

    // TODO: This is a placeholder implementation.
    // The actual implementation will involve the FSM and context manager.
    let response = OpenAIChatCompletionResponse {
        id: Uuid::new_v4().to_string(),
        object: "chat.completion".to_string(),
        created: 0,
        model: req.model.clone(),
        choices: vec![OpenAIChoice {
            index: 0,
            message: Some(OpenAIMessage {
                role: "assistant".to_string(),
                content: OpenAIContent::Text("Placeholder response".to_string()),
            }),
            delta: None,
            finish_reason: Some("stop".to_string()),
        }],
        usage: Some(OpenAIUsage {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        }),
    };
    Ok(HttpResponse::Ok().json(response))
}

pub async fn models(_app_state: web::Data<AppState>) -> Result<HttpResponse> {
    info!("Received models request");

    // TODO: This should be fetched from a model service or config
    let models = vec!["gpt-4", "gpt-3.5-turbo"];

    let openai_models: Vec<OpenAIModel> = models
        .into_iter()
        .map(|model_id| OpenAIModel {
            id: model_id.to_string(),
            object: "model".to_string(),
            created: 0,
            owned_by: "openai".to_string(),
        })
        .collect();

    let response = OpenAIModelsResponse {
        object: "list".to_string(),
        data: openai_models,
    };

    Ok(HttpResponse::Ok().json(response))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/chat/completions").route(web::post().to(chat_completions)))
        .service(web::resource("/models").route(web::get().to(models)));
}
