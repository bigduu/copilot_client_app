use actix_web::{web, HttpResponse, Result};
use log::{error, info};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use super::models::{
    OpenAIChatCompletionRequest, OpenAIChatCompletionResponse, OpenAIChoice, OpenAIDelta,
    OpenAIError, OpenAIErrorDetail, OpenAIMessage, OpenAIModel, OpenAIModelsResponse,
    OpenAIStreamChunk, OpenAIUsage,
};
use crate::copilot::CopilotClient;

pub async fn chat_completions(
    req: web::Json<OpenAIChatCompletionRequest>,
    copilot_client: web::Data<Arc<CopilotClient>>,
) -> Result<HttpResponse> {
    info!("Received chat completion request for model: {}", req.model);

    // Convert OpenAI messages to internal format
    let internal_messages: Vec<crate::copilot::model::stream_model::Message> =
        req.messages.iter().cloned().map(|msg| msg.into()).collect();

    let model = Some(req.model.clone());
    let is_stream = req.stream.unwrap_or(false);

    if is_stream {
        handle_stream_request(internal_messages, model, copilot_client).await
    } else {
        handle_non_stream_request(internal_messages, model, copilot_client).await
    }
}

async fn handle_stream_request(
    messages: Vec<crate::copilot::model::stream_model::Message>,
    model: Option<String>,
    copilot_client: web::Data<Arc<CopilotClient>>,
) -> Result<HttpResponse> {
    let (mut rx, handle) = copilot_client
        .send_stream_request(messages, model.clone())
        .await;

    let request_id = Uuid::new_v4().to_string();
    let model_name = model.unwrap_or_else(|| "gpt-4.1".to_string());
    let created = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let stream = async_stream::stream! {
        while let Some(message) = rx.recv().await {
            match message {
                Ok(bytes) => {
                    // Parse the internal stream chunk
                    if let Ok(chunk_str) = String::from_utf8(bytes.to_vec()) {
                        if let Ok(internal_chunk) = serde_json::from_str::<crate::copilot::model::stream_model::StreamChunk>(&chunk_str) {
                            // Convert to OpenAI format
                            let openai_chunk = OpenAIStreamChunk {
                                id: request_id.clone(),
                                object: "chat.completion.chunk".to_string(),
                                created,
                                model: model_name.clone(),
                                choices: vec![OpenAIChoice {
                                    index: 0,
                                    message: None,
                                    delta: Some(OpenAIDelta {
                                        role: internal_chunk.choices.get(0).map(|c| c.delta.role.clone()).flatten(),
                                        content: internal_chunk.choices.get(0).map(|c| c.delta.content.clone()).flatten(),
                                    }),
                                    finish_reason: internal_chunk.choices.get(0)
                                        .and_then(|c| c.finish_reason.clone()),
                                }],
                            };

                            if let Ok(json_str) = serde_json::to_string(&openai_chunk) {
                                yield Ok::<_, actix_web::Error>(web::Bytes::from(format!("data: {}\n\n", json_str)));
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Stream error: {}", e);
                    let error_chunk = json!({
                        "error": {
                            "message": e.to_string(),
                            "type": "internal_error"
                        }
                    });
                    yield Ok::<_, actix_web::Error>(web::Bytes::from(format!("data: {}\n\n", error_chunk)));
                    break;
                }
            }
        }

        // Send final chunk
        yield Ok::<_, actix_web::Error>(web::Bytes::from("data: [DONE]\n\n"));
    };

    // Spawn the handle to ensure it completes
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            error!("Stream handle error: {}", e);
        }
    });

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .streaming(stream))
}

async fn handle_non_stream_request(
    messages: Vec<crate::copilot::model::stream_model::Message>,
    model: Option<String>,
    copilot_client: web::Data<Arc<CopilotClient>>,
) -> Result<HttpResponse> {
    let (mut rx, handle) = copilot_client
        .send_stream_request(messages, model.clone())
        .await;

    let mut full_content = String::new();
    let mut finish_reason = None;

    // Collect all stream chunks
    while let Some(message) = rx.recv().await {
        match message {
            Ok(bytes) => {
                if let Ok(chunk_str) = String::from_utf8(bytes.to_vec()) {
                    if let Ok(internal_chunk) = serde_json::from_str::<
                        crate::copilot::model::stream_model::StreamChunk,
                    >(&chunk_str)
                    {
                        if let Some(choice) = internal_chunk.choices.get(0) {
                            let delta = &choice.delta;
                            if let Some(content) = &delta.content {
                                full_content.push_str(content);
                            }
                            if choice.finish_reason.is_some() {
                                finish_reason = choice.finish_reason.clone();
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("Non-stream error: {}", e);
                return Ok(HttpResponse::InternalServerError().json(OpenAIError {
                    error: OpenAIErrorDetail {
                        message: e.to_string(),
                        error_type: "internal_error".to_string(),
                        code: None,
                    },
                }));
            }
        }
    }

    // Wait for handle to complete
    if let Err(e) = handle.await {
        error!("Non-stream handle error: {}", e);
        return Ok(HttpResponse::InternalServerError().json(OpenAIError {
            error: OpenAIErrorDetail {
                message: format!("Request failed: {}", e),
                error_type: "internal_error".to_string(),
                code: None,
            },
        }));
    }

    let request_id = Uuid::new_v4().to_string();
    let model_name = model.unwrap_or_else(|| "gpt-4.1".to_string());
    let created = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let response = OpenAIChatCompletionResponse {
        id: request_id,
        object: "chat.completion".to_string(),
        created,
        model: model_name,
        choices: vec![OpenAIChoice {
            index: 0,
            message: Some(OpenAIMessage {
                role: "assistant".to_string(),
                content: super::models::OpenAIContent::Text(full_content),
            }),
            delta: None,
            finish_reason,
        }],
        usage: Some(OpenAIUsage {
            prompt_tokens: 0, // We don't have token counting implemented
            completion_tokens: 0,
            total_tokens: 0,
        }),
    };

    Ok(HttpResponse::Ok().json(response))
}

pub async fn models(copilot_client: web::Data<Arc<CopilotClient>>) -> Result<HttpResponse> {
    info!("Received models request");

    match copilot_client.get_models().await {
        Ok(models) => {
            let openai_models: Vec<OpenAIModel> = models
                .into_iter()
                .map(|model| OpenAIModel {
                    id: model,
                    object: "model".to_string(),
                    created: 1677610602, // Static timestamp for compatibility
                    owned_by: "github-copilot".to_string(),
                })
                .collect();

            let response = OpenAIModelsResponse {
                object: "list".to_string(),
                data: openai_models,
            };

            Ok(HttpResponse::Ok().json(response))
        }
        Err(e) => {
            error!("Failed to get models: {}", e);
            Ok(HttpResponse::InternalServerError().json(OpenAIError {
                error: OpenAIErrorDetail {
                    message: format!("Failed to get models: {}", e),
                    error_type: "internal_error".to_string(),
                    code: None,
                },
            }))
        }
    }
}
