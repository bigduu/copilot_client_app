//! Anthropic to OpenAI Conversion
//!
//! Provides bidirectional conversion between Anthropic and OpenAI API formats.

use crate::models::*;
use agent_llm::api::models::*;
use serde_json::{json, Value};

/// Convert Anthropic messages request to OpenAI chat completion request
pub fn convert_messages_request(
    request: AnthropicMessagesRequest,
) -> Result<ChatCompletionRequest, AnthropicError> {
    let mut out_messages = Vec::new();

    // Handle system prompt
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

    // Convert messages
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
            AnthropicContent::Blocks(blocks) => {
                // Simplified block handling
                let text = blocks
                    .into_iter()
                    .filter_map(|block| match block {
                        AnthropicContentBlock::Text { text } => Some(text),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                if !text.is_empty() {
                    out_messages.push(ChatMessage {
                        role,
                        content: Content::Text(text),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
            }
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
    if let Some(stop_sequences) = request.stop_sequences {
        parameters.insert("stop".to_string(), json!(stop_sequences));
    }

    // Convert tools
    let tools = request.tools.map(|tools| {
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
            .collect()
    });

    Ok(ChatCompletionRequest {
        model: request.model,
        messages: out_messages,
        tools,
        tool_choice: None,
        stream: request.stream,
        parameters,
    })
}

/// Convert OpenAI chat completion response to Anthropic messages response
pub fn convert_messages_response(
    response: ChatCompletionResponse,
    response_model: &str,
) -> Result<AnthropicMessagesResponse, AnthropicError> {
    let choice = response.choices.into_iter().next().ok_or_else(|| {
        AnthropicError::new(
            502,
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
                    _ => {}
                }
            }
        }
    }

    // Handle tool calls
    if let Some(tool_calls) = choice.message.tool_calls {
        for tool_call in tool_calls {
            if tool_call.tool_type == "function" {
                let input: Value = serde_json::from_str(&tool_call.function.arguments)
                    .unwrap_or_else(|_| json!({}));
                content_blocks.push(AnthropicResponseContentBlock::ToolUse {
                    id: tool_call.id,
                    name: tool_call.function.name,
                    input,
                });
            }
        }
    }

    let stop_reason = match choice.finish_reason {
        Some(reason) => match reason.as_str() {
            "stop" => "end_turn".to_string(),
            "tool_calls" => "tool_use".to_string(),
            "length" => "max_tokens".to_string(),
            _ => "end_turn".to_string(),
        },
        None => "end_turn".to_string(),
    };

    let (input_tokens, output_tokens) = match &response.usage {
        Some(usage) => (usage.prompt_tokens as u32, usage.completion_tokens as u32),
        None => (0, 0),
    };

    Ok(AnthropicMessagesResponse {
        id: response.id,
        response_type: "message".to_string(),
        role: "assistant".to_string(),
        content: content_blocks,
        model: response_model.to_string(),
        stop_reason,
        stop_sequence: None,
        usage: AnthropicUsage {
            input_tokens,
            output_tokens,
        },
    })
}

/// Convert Anthropic complete request to OpenAI chat completion request
pub fn convert_complete_request(
    request: AnthropicCompleteRequest,
) -> Result<ChatCompletionRequest, AnthropicError> {
    let messages = vec![ChatMessage {
        role: Role::User,
        content: Content::Text(request.prompt),
        tool_calls: None,
        tool_call_id: None,
    }];

    let mut parameters = request.extra;
    parameters.insert(
        "max_tokens".to_string(),
        json!(request.max_tokens_to_sample),
    );

    if let Some(temperature) = request.temperature {
        parameters.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(top_p) = request.top_p {
        parameters.insert("top_p".to_string(), json!(top_p));
    }
    if let Some(stop_sequences) = request.stop_sequences {
        parameters.insert("stop".to_string(), json!(stop_sequences));
    }

    Ok(ChatCompletionRequest {
        model: request.model,
        messages,
        tools: None,
        tool_choice: None,
        stream: request.stream,
        parameters,
    })
}

/// Convert OpenAI chat completion response to Anthropic complete response
pub fn convert_complete_response(
    response: ChatCompletionResponse,
    response_model: &str,
) -> Result<AnthropicCompleteResponse, AnthropicError> {
    let choice = response.choices.into_iter().next().ok_or_else(|| {
        AnthropicError::new(
            502,
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
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(""),
    };

    let stop_reason = match choice.finish_reason {
        Some(reason) => match reason.as_str() {
            "stop" => "stop_sequence".to_string(),
            "length" => "max_tokens".to_string(),
            _ => "stop_sequence".to_string(),
        },
        None => "stop_sequence".to_string(),
    };

    Ok(AnthropicCompleteResponse {
        response_type: "completion".to_string(),
        completion,
        model: response_model.to_string(),
        stop_reason,
    })
}

/// Create Anthropic error response
pub fn create_error_response(error: AnthropicError) -> AnthropicErrorEnvelope {
    AnthropicErrorEnvelope {
        error_type: "error".to_string(),
        error: AnthropicErrorDetail {
            error_type: error.error_type,
            message: error.message,
        },
    }
}

/// Extract text content from Anthropic content
pub fn extract_text_content(content: &AnthropicContent) -> String {
    match content {
        AnthropicContent::Text(text) => text.clone(),
        AnthropicContent::Blocks(blocks) => blocks
            .iter()
            .filter_map(|block| match block {
                AnthropicContentBlock::Text { text } => Some(text.clone()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}
