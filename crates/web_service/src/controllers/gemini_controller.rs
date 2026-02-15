use crate::services::gemini_model_mapping_service::resolve_model;
use crate::{error::AppError, server::AppState};
use actix_web::{get, post, web, HttpResponse};
use agent_core::Message;
use agent_llm::protocol::gemini::{
    GeminiCandidate, GeminiContent, GeminiPart, GeminiRequest, GeminiResponse,
};
use agent_llm::protocol::FromProvider;
use agent_llm::LLMChunk;
use anyhow::anyhow;
use bytes::Bytes;
use futures_util::StreamExt;
use serde_json::json;

/// Configure Gemini API routes
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/models")
            .service(generate_content)
            .service(stream_generate_content)
            .service(list_models),
    );
}

/// Generate content (non-streaming)
#[post("/{model}:generateContent")]
pub async fn generate_content(
    path: web::Path<String>,
    request: web::Json<GeminiRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let gemini_model = path.into_inner();

    // Resolve model mapping
    let resolution = match resolve_model(&gemini_model).await {
        Ok(res) => res,
        Err(e) => {
            log::warn!("Failed to resolve model mapping for '{}': {}", gemini_model, e);
            // Continue with empty mapping (will use default model)
            crate::services::gemini_model_mapping_service::ModelResolution {
                mapped_model: String::new(),
                response_model: gemini_model.clone(),
            }
        }
    };

    log::info!(
        "Gemini generateContent: requested='{}', mapped='{}'",
        gemini_model,
        if resolution.mapped_model.is_empty() {
            "(default)"
        } else {
            &resolution.mapped_model
        }
    );

    // 1. Convert Gemini format → Message
    let internal_messages = convert_gemini_to_messages(&request.contents)?;

    // 2. Get provider
    let provider = state.get_provider().await;

    // 3. Call provider with mapped model
    let model_override = if resolution.mapped_model.is_empty() {
        None
    } else {
        Some(resolution.mapped_model.as_str())
    };

    let mut stream = provider
        .chat_stream(&internal_messages, &[], None, model_override)
        .await
        .map_err(|e| AppError::InternalError(anyhow!("Provider error: {}", e)))?;

    // 4. Collect response
    let mut full_content = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(LLMChunk::Token(token)) => full_content.push_str(&token),
            Ok(LLMChunk::Done) => break,
            Ok(LLMChunk::ToolCalls(_)) => {
                // TODO: Handle tool calls
            }
            Err(e) => {
                return Err(AppError::InternalError(anyhow!(
                    "Stream error: {}",
                    e
                )))
            }
        }
    }

    // 5. Convert back to Gemini format
    let gemini_response = GeminiResponse {
        candidates: vec![GeminiCandidate {
            content: GeminiContent {
                role: "model".to_string(),
                parts: vec![GeminiPart {
                    text: Some(full_content),
                    function_call: None,
                    function_response: None,
                }],
            },
            finish_reason: Some("STOP".to_string()),
        }],
    };

    Ok(HttpResponse::Ok().json(gemini_response))
}

/// Stream generate content
#[post("/{model}:streamGenerateContent")]
pub async fn stream_generate_content(
    path: web::Path<String>,
    request: web::Json<GeminiRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let gemini_model = path.into_inner();

    // Resolve model mapping
    let resolution = match resolve_model(&gemini_model).await {
        Ok(res) => res,
        Err(e) => {
            log::warn!("Failed to resolve model mapping for '{}': {}", gemini_model, e);
            // Continue with empty mapping (will use default model)
            crate::services::gemini_model_mapping_service::ModelResolution {
                mapped_model: String::new(),
                response_model: gemini_model.clone(),
            }
        }
    };

    log::info!(
        "Gemini streamGenerateContent: requested='{}', mapped='{}'",
        gemini_model,
        if resolution.mapped_model.is_empty() {
            "(default)"
        } else {
            &resolution.mapped_model
        }
    );

    // 1. Convert Gemini format → Message
    let internal_messages = convert_gemini_to_messages(&request.contents)?;

    // 2. Get provider and create stream
    let model_override = if resolution.mapped_model.is_empty() {
        None
    } else {
        Some(resolution.mapped_model.as_str())
    };

    let mut stream = state
        .get_provider()
        .await
        .chat_stream(&internal_messages, &[], None, model_override)
        .await
        .map_err(|e| AppError::InternalError(anyhow!("Provider error: {}", e)))?;

    // 3. Create SSE stream
    let gemini_stream = async_stream::stream! {
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(LLMChunk::Token(token)) => {
                    let gemini_chunk = GeminiResponse {
                        candidates: vec![GeminiCandidate {
                            content: GeminiContent {
                                role: "model".to_string(),
                                parts: vec![GeminiPart {
                                    text: Some(token),
                                    function_call: None,
                                    function_response: None,
                                }],
                            },
                            finish_reason: None,
                        }],
                    };

                    let json = match serde_json::to_string(&gemini_chunk) {
                        Ok(s) => s,
                        Err(e) => {
                            yield Err(actix_web::Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                format!("JSON error: {}", e),
                            )));
                            continue;
                        }
                    };

                    yield Ok::<_, actix_web::Error>(Bytes::from(format!("data: {}\n\n", json)));
                }
                Ok(LLMChunk::Done) => {
                    // Send final chunk
                    let final_chunk = GeminiResponse {
                        candidates: vec![GeminiCandidate {
                            content: GeminiContent {
                                role: "model".to_string(),
                                parts: vec![],
                            },
                            finish_reason: Some("STOP".to_string()),
                        }],
                    };
                    let json = serde_json::to_string(&final_chunk).unwrap_or_default();
                    yield Ok::<_, actix_web::Error>(Bytes::from(format!("data: {}\n\n", json)));
                    break;
                }
                Ok(LLMChunk::ToolCalls(_)) => {
                    // TODO: Handle tool calls in streaming
                }
                Err(e) => {
                    yield Err(actix_web::Error::from(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Stream error: {}", e),
                    )));
                    break;
                }
            }
        }
    };

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(gemini_stream))
}

/// List available models
#[get("/models")]
pub async fn list_models(
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let provider = state.get_provider().await;

    let models = provider
        .list_models()
        .await
        .map_err(|e| AppError::InternalError(anyhow!("Failed to list models: {}", e)))?;

    // Convert to Gemini format
    let gemini_models: Vec<_> = models
        .into_iter()
        .map(|name| {
            json!({
                "name": format!("models/{}", name),
                "displayName": name,
                "supportedGenerationMethods": [
                    "generateContent",
                    "streamGenerateContent"
                ],
            })
        })
        .collect();

    Ok(HttpResponse::Ok().json(json!({
        "models": gemini_models
    })))
}

/// Helper: Convert Gemini contents to internal Messages
fn convert_gemini_to_messages(
    contents: &[GeminiContent],
) -> Result<Vec<Message>, AppError> {
    contents
        .iter()
        .map(|content| {
            Message::from_provider(content.clone()).map_err(|e| {
                AppError::ToolExecutionError(format!("Failed to convert message: {}", e))
            })
        })
        .collect()
}
