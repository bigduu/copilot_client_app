use crate::services::anthropic_model_mapping_service::load_anthropic_model_mapping;
use crate::{error::AppError, server::AppState};
use actix_web::{get, http::StatusCode, post, web, HttpResponse};
use agent_llm::api::models::{
    ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStreamChunk, ChatMessage, Content,
    ContentPart, FunctionCall, ImageUrl, Role, StreamToolCall, Tool, ToolCall, ToolChoice, Usage,
};
use agent_llm::ProxyAuthRequiredError;
use async_stream::stream;
use bytes::Bytes;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::mpsc;

#[derive(Deserialize)]
struct AnthropicMessagesRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(default)]
    system: Option<AnthropicSystem>,
    #[serde(default)]
    max_tokens: Option<u32>,
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default)]
    top_p: Option<f32>,
    #[serde(default)]
    top_k: Option<u32>,
    #[serde(default)]
    stop_sequences: Option<Vec<String>>,
    #[serde(default)]
    stream: Option<bool>,
    #[serde(default)]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(default)]
    tool_choice: Option<AnthropicToolChoice>,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Deserialize)]
struct AnthropicMessage {
    role: AnthropicRole,
    content: AnthropicContent,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "lowercase")]
enum AnthropicRole {
    User,
    Assistant,
    System,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        content: Value,
    },
}

#[derive(Deserialize)]
#[serde(untagged)]
enum AnthropicSystem {
    Text(String),
    Blocks(Vec<AnthropicSystemBlock>),
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicSystemBlock {
    Text { text: String },
}

#[derive(Deserialize)]
struct AnthropicTool {
    name: String,
    #[serde(default)]
    description: Option<String>,
    input_schema: Value,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum AnthropicToolChoice {
    String(String),
    Tool {
        #[serde(rename = "type")]
        tool_type: String,
        name: String,
    },
}

#[derive(Deserialize)]
struct AnthropicCompleteRequest {
    model: String,
    prompt: String,
    max_tokens_to_sample: u32,
    #[serde(default)]
    stop_sequences: Option<Vec<String>>,
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default)]
    top_p: Option<f32>,
    #[serde(default)]
    top_k: Option<u32>,
    #[serde(default)]
    stream: Option<bool>,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Serialize)]
struct AnthropicMessagesResponse {
    id: String,
    #[serde(rename = "type")]
    response_type: String,
    role: String,
    content: Vec<AnthropicResponseContentBlock>,
    model: String,
    stop_reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequence: Option<String>,
    usage: AnthropicUsage,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicResponseContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
}

#[derive(Serialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Serialize)]
struct AnthropicCompleteResponse {
    #[serde(rename = "type")]
    response_type: String,
    completion: String,
    model: String,
    stop_reason: String,
}

#[derive(Serialize)]
struct AnthropicErrorEnvelope {
    #[serde(rename = "type")]
    error_type: String,
    error: AnthropicErrorDetail,
}

#[derive(Serialize)]
struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}

#[post("/messages")]
pub async fn messages(
    app_state: web::Data<AppState>,
    req: web::Json<AnthropicMessagesRequest>,
) -> Result<HttpResponse, AppError> {
    let stream = req.stream.unwrap_or(false);
    let request = req.into_inner();
    let response_model = request.model.clone();

    let resolution = match resolve_model(&response_model).await {
        Ok(resolution) => resolution,
        Err(err) => return Ok(anthropic_error_response(err)),
    };

    let mut openai_request = match convert_messages_request(request) {
        Ok(request) => request,
        Err(err) => return Ok(anthropic_error_response(err)),
    };
    openai_request.model = resolution.mapped_model.clone();

    if stream {
        let (tx, rx) = mpsc::channel(10);
        let client = app_state.copilot_client.clone();
        let model = resolution.response_model.clone();

        let response = match client.send_chat_completion_request(openai_request).await {
            Ok(resp) => resp,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Upstream API error: {}", err),
                )))
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Ok(anthropic_error_response(AnthropicError::new(
                to_actix_status(status.as_u16()),
                "api_error",
                format!("Upstream API error. Status: {}, Body: {}", status, body),
            )));
        }

        tokio::spawn(async move {
            if let Err(e) = client.process_chat_completion_stream(response, tx).await {
                log::error!("Failed to process stream: {}", e);
            }
        });

        let stream = stream! {
            let mut state = AnthropicStreamState::new(model);
            let mut receiver = rx;
            while let Some(res) = receiver.recv().await {
                match res {
                    Ok(bytes) => {
                        if bytes == "[DONE]" {
                            if !state.sent_message_stop {
                                let payload = state.finish(None);
                                yield Ok::<Bytes, AppError>(Bytes::from(payload));
                            }
                            yield Ok::<Bytes, AppError>(Bytes::from("data: [DONE]\n\n"));
                            break;
                        }

                        match serde_json::from_slice::<ChatCompletionStreamChunk>(&bytes) {
                            Ok(chunk) => {
                                let payload = state.handle_chunk(&chunk);
                                if !payload.is_empty() {
                                    yield Ok::<Bytes, AppError>(Bytes::from(payload));
                                }
                            }
                            Err(err) => {
                                let payload = format_sse_event(
                                    "error",
                                    json!({
                                        "type": "error",
                                        "error": {
                                            "type": "api_error",
                                            "message": format!("Failed to parse stream chunk: {}", err)
                                        }
                                    }),
                                );
                                yield Ok::<Bytes, AppError>(Bytes::from(payload));
                                yield Ok::<Bytes, AppError>(Bytes::from("data: [DONE]\n\n"));
                                break;
                            }
                        }
                    }
                    Err(err) => {
                        let payload = format_sse_event(
                            "error",
                            json!({
                                "type": "error",
                                "error": {
                                    "type": "api_error",
                                    "message": format!("Stream error: {}", err)
                                }
                            }),
                        );
                        yield Ok::<Bytes, AppError>(Bytes::from(payload));
                        yield Ok::<Bytes, AppError>(Bytes::from("data: [DONE]\n\n"));
                        break;
                    }
                }
            }
        };

        Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(stream))
    } else {
        let response = match app_state
            .copilot_client
            .send_chat_completion_request(openai_request)
            .await
        {
            Ok(resp) => resp,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Upstream API error: {}", err),
                )))
            }
        };

        let status = response.status();
        let body = match response.bytes().await {
            Ok(body) => body,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Failed to read response body: {}", err),
                )))
            }
        };

        if !status.is_success() {
            return Ok(anthropic_error_response(AnthropicError::new(
                to_actix_status(status.as_u16()),
                "api_error",
                format!(
                    "Upstream API error. Status: {}, Body: {}",
                    status,
                    String::from_utf8_lossy(&body)
                ),
            )));
        }

        let completion = match serde_json::from_slice::<ChatCompletionResponse>(&body) {
            Ok(value) => value,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Failed to parse response: {}", err),
                )))
            }
        };

        let response = match convert_messages_response(completion, &resolution.response_model) {
            Ok(value) => value,
            Err(err) => return Ok(anthropic_error_response(err)),
        };

        Ok(HttpResponse::Ok().json(response))
    }
}

#[post("/complete")]
pub async fn complete(
    app_state: web::Data<AppState>,
    req: web::Json<AnthropicCompleteRequest>,
) -> Result<HttpResponse, AppError> {
    let stream = req.stream.unwrap_or(false);
    let request = req.into_inner();
    let response_model = request.model.clone();

    let resolution = match resolve_model(&response_model).await {
        Ok(resolution) => resolution,
        Err(err) => return Ok(anthropic_error_response(err)),
    };

    let mut openai_request = match convert_complete_request(request) {
        Ok(request) => request,
        Err(err) => return Ok(anthropic_error_response(err)),
    };
    openai_request.model = resolution.mapped_model.clone();

    if stream {
        let (tx, rx) = mpsc::channel(10);
        let client = app_state.copilot_client.clone();
        let model = resolution.response_model.clone();

        let response = match client.send_chat_completion_request(openai_request).await {
            Ok(resp) => resp,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Upstream API error: {}", err),
                )))
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Ok(anthropic_error_response(AnthropicError::new(
                to_actix_status(status.as_u16()),
                "api_error",
                format!("Upstream API error. Status: {}, Body: {}", status, body),
            )));
        }

        tokio::spawn(async move {
            if let Err(e) = client.process_chat_completion_stream(response, tx).await {
                log::error!("Failed to process stream: {}", e);
            }
        });

        let stream = stream! {
            let mut receiver = rx;
            while let Some(res) = receiver.recv().await {
                match res {
                    Ok(bytes) => {
                        if bytes == "[DONE]" {
                            yield Ok::<Bytes, AppError>(Bytes::from("data: [DONE]\n\n"));
                            break;
                        }

                        match serde_json::from_slice::<ChatCompletionStreamChunk>(&bytes) {
                            Ok(chunk) => {
                                let payload = map_completion_stream_chunk(&chunk, &model);
                                if !payload.is_empty() {
                                    yield Ok::<Bytes, AppError>(Bytes::from(payload));
                                }
                            }
                            Err(err) => {
                                let payload = format_sse_data(json!({
                                    "type": "error",
                                    "error": {
                                        "type": "api_error",
                                        "message": format!("Failed to parse stream chunk: {}", err)
                                    }
                                }));
                                yield Ok::<Bytes, AppError>(Bytes::from(payload));
                                yield Ok::<Bytes, AppError>(Bytes::from("data: [DONE]\n\n"));
                                break;
                            }
                        }
                    }
                    Err(err) => {
                        let payload = format_sse_data(json!({
                            "type": "error",
                            "error": {
                                "type": "api_error",
                                "message": format!("Stream error: {}", err)
                            }
                        }));
                        yield Ok::<Bytes, AppError>(Bytes::from(payload));
                        yield Ok::<Bytes, AppError>(Bytes::from("data: [DONE]\n\n"));
                        break;
                    }
                }
            }
        };

        Ok(HttpResponse::Ok()
            .content_type("text/event-stream")
            .streaming(stream))
    } else {
        let response = match app_state
            .copilot_client
            .send_chat_completion_request(openai_request)
            .await
        {
            Ok(resp) => resp,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Upstream API error: {}", err),
                )))
            }
        };

        let status = response.status();
        let body = match response.bytes().await {
            Ok(body) => body,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Failed to read response body: {}", err),
                )))
            }
        };

        if !status.is_success() {
            return Ok(anthropic_error_response(AnthropicError::new(
                to_actix_status(status.as_u16()),
                "api_error",
                format!(
                    "Upstream API error. Status: {}, Body: {}",
                    status,
                    String::from_utf8_lossy(&body)
                ),
            )));
        }

        let completion = match serde_json::from_slice::<ChatCompletionResponse>(&body) {
            Ok(value) => value,
            Err(err) => {
                return Ok(anthropic_error_response(AnthropicError::new(
                    StatusCode::BAD_GATEWAY,
                    "api_error",
                    format!("Failed to parse response: {}", err),
                )))
            }
        };

        let response = match convert_complete_response(completion, &resolution.response_model) {
            Ok(value) => value,
            Err(err) => return Ok(anthropic_error_response(err)),
        };

        Ok(HttpResponse::Ok().json(response))
    }
}

/// Anthropic model list response structs
#[derive(Serialize)]
struct AnthropicListModelsResponse {
    data: Vec<AnthropicModel>,
    has_more: bool,
    first_id: Option<String>,
    last_id: Option<String>,
}

#[derive(Serialize)]
struct AnthropicModel {
    #[serde(rename = "type")]
    model_type: String,
    id: String,
    display_name: String,
    created_at: String,
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

    // Convert model IDs to Anthropic-compatible format
    let models: Vec<AnthropicModel> = model_ids
        .into_iter()
        .map(|id| {
            // Create a display name from the model id
            let display_name = format_model_display_name(&id);
            AnthropicModel {
                model_type: "model".to_string(),
                id,
                display_name,
                created_at: "2024-01-01T00:00:00Z".to_string(), // Use a fixed timestamp
            }
        })
        .collect();

    let first_id = models.first().map(|m| m.id.clone());
    let last_id = models.last().map(|m| m.id.clone());

    let response = AnthropicListModelsResponse {
        data: models,
        has_more: false,
        first_id,
        last_id,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Format a model ID into a human-readable display name
fn format_model_display_name(model_id: &str) -> String {
    // Handle common model naming patterns
    if model_id.starts_with("claude") {
        model_id
            .replace("claude-3-5-", "Claude 3.5 ")
            .replace("claude-3-", "Claude 3 ")
            .replace("-sonnet", " Sonnet")
            .replace("-haiku", " Haiku")
            .replace("-opus", " Opus")
            .replace("-latest", " (Latest)")
    } else if model_id.starts_with("gpt") {
        model_id
            .replace("gpt-4o", "GPT-4o")
            .replace("gpt-4", "GPT-4")
            .replace("gpt-3.5", "GPT-3.5")
    } else {
        model_id.to_string()
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(messages).service(complete).service(get_models);
}

#[derive(Clone)]
struct AnthropicError {
    status: StatusCode,
    error_type: String,
    message: String,
}

struct ModelResolution {
    mapped_model: String,
    response_model: String,
}

impl AnthropicError {
    fn new(status: StatusCode, error_type: &str, message: String) -> Self {
        Self {
            status,
            error_type: error_type.to_string(),
            message,
        }
    }
}

async fn resolve_model(model: &str) -> Result<ModelResolution, AnthropicError> {
    let mapping = load_anthropic_model_mapping().await.map_err(|err| {
        AnthropicError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "api_error",
            format!("Failed to load model mapping: {}", err),
        )
    })?;

    log::info!(
        "Resolving model '{}', available mappings: {:?}",
        model,
        mapping.mappings
    );

    // Match by keyword in model name (case-insensitive)
    let model_lower = model.to_lowercase();

    let model_type = if model_lower.contains("opus") {
        "opus"
    } else if model_lower.contains("sonnet") {
        "sonnet"
    } else if model_lower.contains("haiku") {
        "haiku"
    } else {
        log::warn!(
            "No Anthropic model mapping found for '{}', falling back to default model",
            model
        );
        return Ok(ModelResolution {
            mapped_model: String::new(),
            response_model: model.to_string(),
        });
    };

    if let Some(mapped) = mapping
        .mappings
        .get(model_type)
        .filter(|value| !value.trim().is_empty())
    {
        log::info!("Model '{}' (type: {}) mapped to '{}'", model, model_type, mapped);
        return Ok(ModelResolution {
            mapped_model: mapped.to_string(),
            response_model: model.to_string(),
        });
    }

    log::warn!(
        "No mapping configured for model type '{}', falling back to default model",
        model_type
    );

    Ok(ModelResolution {
        mapped_model: String::new(),
        response_model: model.to_string(),
    })
}

fn anthropic_error_response(error: AnthropicError) -> HttpResponse {
    HttpResponse::build(error.status).json(AnthropicErrorEnvelope {
        error_type: "error".to_string(),
        error: AnthropicErrorDetail {
            error_type: error.error_type,
            message: error.message,
        },
    })
}

fn convert_messages_request(
    request: AnthropicMessagesRequest,
) -> Result<ChatCompletionRequest, AnthropicError> {
    let mut out_messages = Vec::new();

    if let Some(system) = request.system {
        let system_text = match system {
            AnthropicSystem::Text(text) => text,
            AnthropicSystem::Blocks(blocks) => blocks
                .into_iter()
                .map(|block| match block {
                    AnthropicSystemBlock::Text { text } => text,
                })
                .collect::<Vec<_>>()
                .join("\n"),
        };

        if !system_text.is_empty() {
            out_messages.push(ChatMessage {
                role: Role::System,
                content: Content::Text(system_text),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }

    for message in request.messages {
        let role = match message.role {
            AnthropicRole::User => Role::User,
            AnthropicRole::Assistant => Role::Assistant,
            AnthropicRole::System => Role::System,
        };

        match message.content {
            AnthropicContent::Text(text) => {
                out_messages.push(ChatMessage {
                    role,
                    content: Content::Text(text),
                    tool_calls: None,
                    tool_call_id: None,
                });
            }
            AnthropicContent::Blocks(blocks) => match role {
                Role::User => {
                    append_user_blocks(&mut out_messages, blocks)?;
                }
                Role::Assistant => {
                    out_messages.push(convert_assistant_blocks(blocks)?);
                }
                Role::System => {
                    let system_text = blocks
                        .into_iter()
                        .map(|block| match block {
                            AnthropicContentBlock::Text { text } => Ok(text),
                            _ => Err(AnthropicError::new(
                                StatusCode::BAD_REQUEST,
                                "invalid_request_error",
                                "System messages only support text blocks".to_string(),
                            )),
                        })
                        .collect::<Result<Vec<_>, _>>()?
                        .join("\n");
                    out_messages.push(ChatMessage {
                        role: Role::System,
                        content: Content::Text(system_text),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                Role::Tool => {}
            },
        }
    }

    let mut parameters = request.extra;

    if let Some(max_tokens) = request.max_tokens {
        parameters.insert("max_tokens".to_string(), json!(max_tokens));
    }
    if let Some(temperature) = request.temperature {
        parameters.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(top_p) = request.top_p {
        parameters.insert("top_p".to_string(), json!(top_p));
    }
    if let Some(top_k) = request.top_k {
        parameters.insert("top_k".to_string(), json!(top_k));
    }
    if let Some(stop_sequences) = request.stop_sequences {
        parameters.insert("stop".to_string(), json!(stop_sequences));
    }

    apply_reasoning_mapping(&mut parameters);

    let tools = match request.tools {
        Some(tools) => Some(
            tools
                .into_iter()
                .map(|tool| Tool {
                    tool_type: "function".to_string(),
                    function: agent_llm::api::models::FunctionDefinition {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.input_schema,
                    },
                })
                .collect(),
        ),
        None => None,
    };

    let tool_choice = match request.tool_choice {
        Some(choice) => Some(map_tool_choice(choice)?),
        None => None,
    };

    Ok(ChatCompletionRequest {
        model: request.model,
        messages: out_messages,
        tools,
        tool_choice,
        stream: request.stream,
        parameters,
    })
}

fn apply_reasoning_mapping(parameters: &mut HashMap<String, Value>) {
    let reasoning = match parameters.remove("reasoning") {
        Some(value) => value,
        None => return,
    };

    if parameters.contains_key("reasoning_effort") {
        return;
    }

    let value = match reasoning {
        Value::String(value) => value,
        other => {
            parameters.insert("reasoning".to_string(), other);
            return;
        }
    };

    let normalized = value.trim().to_ascii_lowercase();
    let mapped = match normalized.as_str() {
        "low" => Some("low"),
        "mid" | "medium" => Some("medium"),
        "high" => Some("high"),
        _ => None,
    };

    match mapped {
        Some(effort) => {
            parameters.insert(
                "reasoning_effort".to_string(),
                Value::String(effort.to_string()),
            );
        }
        None => {
            parameters.insert("reasoning".to_string(), Value::String(value));
        }
    }
}

fn append_user_blocks(
    out_messages: &mut Vec<ChatMessage>,
    blocks: Vec<AnthropicContentBlock>,
) -> Result<(), AnthropicError> {
    let mut text_parts = Vec::new();

    for block in blocks {
        match block {
            AnthropicContentBlock::Text { text } => {
                text_parts.push(ContentPart::Text { text });
            }
            AnthropicContentBlock::ToolResult {
                tool_use_id,
                content,
            } => {
                if !text_parts.is_empty() {
                    out_messages.push(ChatMessage {
                        role: Role::User,
                        content: Content::Parts(text_parts),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                    text_parts = Vec::new();
                }

                let result_text = extract_tool_result_text(content)?;
                out_messages.push(ChatMessage {
                    role: Role::Tool,
                    content: Content::Text(result_text),
                    tool_calls: None,
                    tool_call_id: Some(tool_use_id),
                });
            }
            AnthropicContentBlock::ToolUse { .. } => {
                return Err(AnthropicError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_request_error",
                    "tool_use blocks are not valid in user messages".to_string(),
                ));
            }
        }
    }

    if !text_parts.is_empty() {
        let content = if text_parts.len() == 1 {
            match text_parts.pop() {
                Some(ContentPart::Text { text }) => Content::Text(text),
                Some(ContentPart::ImageUrl { image_url }) => {
                    Content::Parts(vec![ContentPart::ImageUrl { image_url }])
                }
                None => Content::Text(String::new()),
            }
        } else {
            Content::Parts(text_parts)
        };

        out_messages.push(ChatMessage {
            role: Role::User,
            content,
            tool_calls: None,
            tool_call_id: None,
        });
    }

    Ok(())
}

fn convert_assistant_blocks(
    blocks: Vec<AnthropicContentBlock>,
) -> Result<ChatMessage, AnthropicError> {
    let mut tool_calls = Vec::new();
    let mut content_parts = Vec::new();

    for block in blocks {
        match block {
            AnthropicContentBlock::Text { text } => {
                content_parts.push(ContentPart::Text { text });
            }
            AnthropicContentBlock::ToolUse { id, name, input } => {
                tool_calls.push(ToolCall {
                    id,
                    tool_type: "function".to_string(),
                    function: FunctionCall {
                        name,
                        arguments: serde_json::to_string(&input).unwrap_or_default(),
                    },
                });
            }
            AnthropicContentBlock::ToolResult { .. } => {
                return Err(AnthropicError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_request_error",
                    "tool_result blocks are not valid in assistant messages".to_string(),
                ));
            }
        }
    }

    let content = if content_parts.is_empty() && !tool_calls.is_empty() {
        Content::Text(String::new())
    } else if content_parts.len() == 1 {
        match content_parts.into_iter().next() {
            Some(ContentPart::Text { text }) => Content::Text(text),
            Some(ContentPart::ImageUrl { image_url }) => {
                Content::Parts(vec![ContentPart::ImageUrl { image_url }])
            }
            None => Content::Text(String::new()),
        }
    } else {
        Content::Parts(content_parts)
    };

    Ok(ChatMessage {
        role: Role::Assistant,
        content,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        },
        tool_call_id: None,
    })
}

fn extract_tool_result_text(content: Value) -> Result<String, AnthropicError> {
    match content {
        Value::String(text) => Ok(text),
        Value::Array(items) => {
            let mut texts = Vec::new();
            for item in items {
                let obj = item.as_object().ok_or_else(|| {
                    AnthropicError::new(
                        StatusCode::BAD_REQUEST,
                        "invalid_request_error",
                        "tool_result content blocks must be objects".to_string(),
                    )
                })?;

                let block_type = obj
                    .get("type")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| {
                        AnthropicError::new(
                            StatusCode::BAD_REQUEST,
                            "invalid_request_error",
                            "tool_result content blocks missing type".to_string(),
                        )
                    })?;

                if block_type != "text" {
                    return Err(AnthropicError::new(
                        StatusCode::BAD_REQUEST,
                        "invalid_request_error",
                        "tool_result content blocks must be text".to_string(),
                    ));
                }

                let text = obj
                    .get("text")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| {
                        AnthropicError::new(
                            StatusCode::BAD_REQUEST,
                            "invalid_request_error",
                            "tool_result content blocks missing text".to_string(),
                        )
                    })?;

                texts.push(text.to_string());
            }

            Ok(texts.join("\n"))
        }
        _ => Err(AnthropicError::new(
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
            "tool_result content must be a string or array".to_string(),
        )),
    }
}

fn map_tool_choice(choice: AnthropicToolChoice) -> Result<ToolChoice, AnthropicError> {
    match choice {
        AnthropicToolChoice::String(value) => Ok(ToolChoice::String(match value.as_str() {
            "auto" => "auto".to_string(),
            "any" => "auto".to_string(),
            "none" => "none".to_string(),
            _ => {
                return Err(AnthropicError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_request_error",
                    format!("Unsupported tool_choice value: {}", value),
                ))
            }
        })),
        AnthropicToolChoice::Tool { tool_type, name } => {
            if tool_type != "tool" {
                return Err(AnthropicError::new(
                    StatusCode::BAD_REQUEST,
                    "invalid_request_error",
                    format!("Unsupported tool_choice type: {}", tool_type),
                ));
            }
            Ok(ToolChoice::Object {
                tool_type: "function".to_string(),
                function: agent_llm::api::models::FunctionChoice { name },
            })
        }
    }
}

fn convert_messages_response(
    response: ChatCompletionResponse,
    response_model: &str,
) -> Result<AnthropicMessagesResponse, AnthropicError> {
    let choice = response.choices.into_iter().next().ok_or_else(|| {
        AnthropicError::new(
            StatusCode::BAD_GATEWAY,
            "api_error",
            "Upstream response missing choices".to_string(),
        )
    })?;

    let mut content_blocks = Vec::new();

    match choice.message.content {
        Content::Text(text) => {
            if !text.is_empty() {
                content_blocks.push(AnthropicResponseContentBlock::Text { text });
            }
        }
        Content::Parts(parts) => {
            for part in parts {
                match part {
                    ContentPart::Text { text } => {
                        content_blocks.push(AnthropicResponseContentBlock::Text { text });
                    }
                    ContentPart::ImageUrl {
                        image_url: ImageUrl { .. },
                    } => {
                        return Err(AnthropicError::new(
                            StatusCode::BAD_GATEWAY,
                            "api_error",
                            "Image content is not supported for Anthropic responses".to_string(),
                        ));
                    }
                }
            }
        }
    }

    if let Some(tool_calls) = choice.message.tool_calls {
        for tool_call in tool_calls {
            let input = serde_json::from_str(&tool_call.function.arguments)
                .unwrap_or(Value::String(tool_call.function.arguments));
            content_blocks.push(AnthropicResponseContentBlock::ToolUse {
                id: tool_call.id,
                name: tool_call.function.name,
                input,
            });
        }
    }

    let usage = response.usage.unwrap_or(Usage {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
    });

    let model = if response_model.is_empty() {
        response.model.unwrap_or_default()
    } else {
        response_model.to_string()
    };

    Ok(AnthropicMessagesResponse {
        id: response.id,
        response_type: "message".to_string(),
        role: "assistant".to_string(),
        content: content_blocks,
        model,
        stop_reason: map_stop_reason(choice.finish_reason.as_deref()),
        stop_sequence: None,
        usage: AnthropicUsage {
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
        },
    })
}

fn convert_complete_request(
    request: AnthropicCompleteRequest,
) -> Result<ChatCompletionRequest, AnthropicError> {
    let mut parameters = request.extra;
    parameters.insert(
        "max_tokens".to_string(),
        json!(request.max_tokens_to_sample),
    );

    if let Some(stop_sequences) = request.stop_sequences {
        parameters.insert("stop".to_string(), json!(stop_sequences));
    }
    if let Some(temperature) = request.temperature {
        parameters.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(top_p) = request.top_p {
        parameters.insert("top_p".to_string(), json!(top_p));
    }
    if let Some(top_k) = request.top_k {
        parameters.insert("top_k".to_string(), json!(top_k));
    }

    apply_reasoning_mapping(&mut parameters);

    Ok(ChatCompletionRequest {
        model: request.model,
        messages: vec![ChatMessage {
            role: Role::User,
            content: Content::Text(request.prompt),
            tool_calls: None,
            tool_call_id: None,
        }],
        tools: None,
        tool_choice: None,
        stream: request.stream,
        parameters,
    })
}

fn convert_complete_response(
    response: ChatCompletionResponse,
    response_model: &str,
) -> Result<AnthropicCompleteResponse, AnthropicError> {
    let choice = response.choices.into_iter().next().ok_or_else(|| {
        AnthropicError::new(
            StatusCode::BAD_GATEWAY,
            "api_error",
            "Upstream response missing choices".to_string(),
        )
    })?;

    let completion = match choice.message.content {
        Content::Text(text) => text,
        Content::Parts(parts) => parts
            .into_iter()
            .filter_map(|part| match part {
                ContentPart::Text { text } => Some(text),
                ContentPart::ImageUrl { .. } => None,
            })
            .collect::<Vec<_>>()
            .join(""),
    };

    let model = if response_model.is_empty() {
        response.model.unwrap_or_default()
    } else {
        response_model.to_string()
    };

    Ok(AnthropicCompleteResponse {
        response_type: "completion".to_string(),
        completion,
        model,
        stop_reason: map_stop_reason_complete(choice.finish_reason.as_deref()),
    })
}

fn map_stop_reason(reason: Option<&str>) -> String {
    match reason {
        Some("stop") => "end_turn".to_string(),
        Some("length") => "max_tokens".to_string(),
        Some("tool_calls") => "tool_use".to_string(),
        Some(value) => value.to_string(),
        None => "end_turn".to_string(),
    }
}

fn map_stop_reason_complete(reason: Option<&str>) -> String {
    match reason {
        Some("length") => "max_tokens".to_string(),
        Some("stop") => "stop_sequence".to_string(),
        Some(value) => value.to_string(),
        None => "stop_sequence".to_string(),
    }
}

fn format_sse_event(event: &str, data: Value) -> String {
    format!("event: {}\ndata: {}\n\n", event, data)
}

fn format_sse_data(data: Value) -> String {
    format!("data: {}\n\n", data)
}

fn to_actix_status(status: u16) -> StatusCode {
    StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY)
}

struct ToolStreamState {
    block_index: usize,
    id: Option<String>,
    name: Option<String>,
    started: bool,
}

struct AnthropicStreamState {
    message_started: bool,
    sent_message_stop: bool,
    next_block_index: usize,
    text_block_index: Option<usize>,
    tool_blocks: HashMap<u32, ToolStreamState>,
    model: String,
    message_id: Option<String>,
}

impl AnthropicStreamState {
    fn new(model: String) -> Self {
        Self {
            message_started: false,
            sent_message_stop: false,
            next_block_index: 0,
            text_block_index: None,
            tool_blocks: HashMap::new(),
            model,
            message_id: None,
        }
    }

    fn handle_chunk(&mut self, chunk: &ChatCompletionStreamChunk) -> String {
        let mut output = String::new();

        if !self.message_started {
            let message_id = chunk.id.clone();
            self.message_id = Some(message_id.clone());
            let model = if self.model.is_empty() {
                chunk.model.clone().unwrap_or_else(|| self.model.clone())
            } else {
                self.model.clone()
            };
            let message_start = json!({
                "type": "message_start",
                "message": {
                    "id": message_id,
                    "type": "message",
                    "role": "assistant",
                    "content": [],
                    "model": model,
                    "stop_reason": null,
                    "stop_sequence": null,
                    "usage": {
                        "input_tokens": 0,
                        "output_tokens": 0
                    }
                }
            });
            output.push_str(&format_sse_event("message_start", message_start));
            self.message_started = true;
        }

        for choice in &chunk.choices {
            if let Some(content) = &choice.delta.content {
                output.push_str(&self.handle_text_delta(content));
            }

            if let Some(tool_calls) = &choice.delta.tool_calls {
                output.push_str(&self.handle_tool_calls(tool_calls));
            }

            if let Some(reason) = &choice.finish_reason {
                output.push_str(&self.finish(Some(reason.as_str())));
            }
        }

        output
    }

    fn handle_text_delta(&mut self, content: &str) -> String {
        let mut output = String::new();

        let block_index = match self.text_block_index {
            Some(index) => index,
            None => {
                let index = self.next_block_index;
                self.next_block_index += 1;
                self.text_block_index = Some(index);
                let start = json!({
                    "type": "content_block_start",
                    "index": index,
                    "content_block": {
                        "type": "text",
                        "text": ""
                    }
                });
                output.push_str(&format_sse_event("content_block_start", start));
                index
            }
        };

        let delta = json!({
            "type": "content_block_delta",
            "index": block_index,
            "delta": {
                "type": "text_delta",
                "text": content
            }
        });
        output.push_str(&format_sse_event("content_block_delta", delta));

        output
    }

    fn handle_tool_calls(&mut self, tool_calls: &[StreamToolCall]) -> String {
        let mut output = String::new();

        for tool_call in tool_calls {
            let tool_index = tool_call.index;
            let entry = self.tool_blocks.entry(tool_index).or_insert_with(|| {
                let block_index = self.next_block_index;
                self.next_block_index += 1;
                ToolStreamState {
                    block_index,
                    id: None,
                    name: None,
                    started: false,
                }
            });

            if let Some(id) = &tool_call.id {
                entry.id = Some(id.clone());
            }

            if let Some(function) = &tool_call.function {
                if let Some(name) = &function.name {
                    entry.name = Some(name.clone());
                }
            }

            if !entry.started && entry.id.is_some() && entry.name.is_some() {
                let start = json!({
                    "type": "content_block_start",
                    "index": entry.block_index,
                    "content_block": {
                        "type": "tool_use",
                        "id": entry.id.clone().unwrap_or_default(),
                        "name": entry.name.clone().unwrap_or_default(),
                        "input": {}
                    }
                });
                output.push_str(&format_sse_event("content_block_start", start));
                entry.started = true;
            }

            if let Some(function) = &tool_call.function {
                if let Some(arguments) = &function.arguments {
                    let delta = json!({
                        "type": "content_block_delta",
                        "index": entry.block_index,
                        "delta": {
                            "type": "input_json_delta",
                            "partial_json": arguments
                        }
                    });
                    output.push_str(&format_sse_event("content_block_delta", delta));
                }
            }
        }

        output
    }

    fn finish(&mut self, reason: Option<&str>) -> String {
        if self.sent_message_stop {
            return String::new();
        }

        let mut output = String::new();

        if let Some(index) = self.text_block_index.take() {
            let stop = json!({
                "type": "content_block_stop",
                "index": index
            });
            output.push_str(&format_sse_event("content_block_stop", stop));
        }

        for entry in self.tool_blocks.values() {
            let stop = json!({
                "type": "content_block_stop",
                "index": entry.block_index
            });
            output.push_str(&format_sse_event("content_block_stop", stop));
        }

        let delta = json!({
            "type": "message_delta",
            "delta": {
                "stop_reason": map_stop_reason(reason),
                "stop_sequence": null
            },
            "usage": {
                "output_tokens": 0
            }
        });
        output.push_str(&format_sse_event("message_delta", delta));

        let stop = json!({ "type": "message_stop" });
        output.push_str(&format_sse_event("message_stop", stop));

        self.sent_message_stop = true;
        output
    }
}

fn map_completion_stream_chunk(chunk: &ChatCompletionStreamChunk, model: &str) -> String {
    let mut output = String::new();
    let model_name = if model.is_empty() {
        chunk.model.clone().unwrap_or_else(|| model.to_string())
    } else {
        model.to_string()
    };
    for choice in &chunk.choices {
        let mut completion = String::new();
        if let Some(content) = &choice.delta.content {
            completion.push_str(content);
        }

        if !completion.is_empty() {
            let data = json!({
                "type": "completion",
                "completion": completion,
                "model": model_name.clone(),
                "stop_reason": Value::Null
            });
            output.push_str(&format_sse_data(data));
        }

        if let Some(reason) = &choice.finish_reason {
            let data = json!({
                "type": "completion",
                "completion": "",
                "model": model_name.clone(),
                "stop_reason": map_stop_reason_complete(Some(reason.as_str()))
            });
            output.push_str(&format_sse_data(data));
        }
    }

    output
}
