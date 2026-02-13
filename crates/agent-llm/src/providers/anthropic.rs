//! Anthropic provider and request-building helpers.

use std::collections::HashMap;

use async_trait::async_trait;
use reqwest::{Client, header::HeaderMap};
use agent_core::{agent::Role, tools::ToolSchema, Message};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::provider::{LLMError, LLMProvider, LLMStream, Result};
use crate::types::LLMChunk;

/// Anthropic Messages API provider.
pub struct AnthropicProvider {
    client: Client,
    api_key: String,
    base_url: String,
    model: String,
    max_tokens: u32,
}

impl AnthropicProvider {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: "https://api.anthropic.com/v1".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_tokens: 1024,
        }
    }

    pub fn with_base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }

    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = max_tokens;
        self
    }

    fn build_headers(&self) -> Result<HeaderMap> {
        use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};

        let mut headers = HeaderMap::new();
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(&self.api_key)
                .map_err(|e| LLMError::Auth(format!("Invalid API key: {}", e)))?,
        );
        headers.insert(
            "anthropic-version",
            HeaderValue::from_static("2023-06-01"),
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        Ok(headers)
    }
}

#[async_trait]
impl LLMProvider for AnthropicProvider {
    async fn chat_stream(&self, messages: &[Message], tools: &[ToolSchema]) -> Result<LLMStream> {
        let body = build_anthropic_request(messages, tools, &self.model, self.max_tokens, true);
        let headers = self.build_headers()?;

        let response = self
            .client
            .post(format!("{}/messages", self.base_url))
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(LLMError::Http)?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.map_err(LLMError::Http)?;

            if status == 401 || status == 403 {
                return Err(LLMError::Auth(format!(
                    "Anthropic authentication failed: {}. Please check your API key.",
                    text
                )));
            }

            return Err(LLMError::Api(format!(
                "Anthropic API error: HTTP {}: {}",
                status, text
            )));
        }

        // Use shared SSE adapter with Anthropic-specific parser
        let mut state = AnthropicStreamState::default();

        let stream = crate::providers::common::sse::llm_stream_from_sse(response, move |event, data| {
            parse_anthropic_sse_event(&mut state, event, data)
        });

        Ok(stream)
    }
}

/// Build an Anthropic Messages API request body from internal message/tool types.
///
/// This is a pure conversion helper: it does no I/O and intentionally omits internal fields
/// like message `id`/`created_at`.
pub fn build_anthropic_request(
    messages: &[Message],
    tools: &[ToolSchema],
    model: &str,
    max_tokens: u32,
    stream: bool,
) -> Value {
    let (system, anthropic_messages) = messages_to_anthropic_json(messages);

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": stream,
        "messages": anthropic_messages,
        "tools": tools_to_anthropic_json(tools),
    });

    if let Some(system) = system {
        body["system"] = json!(system);
    }

    body
}

fn messages_to_anthropic_json(messages: &[Message]) -> (Option<String>, Vec<Value>) {
    let mut system_parts: Vec<&str> = Vec::new();
    let mut out: Vec<Value> = Vec::new();

    for m in messages {
        match m.role {
            Role::System => system_parts.push(m.content.as_str()),
            Role::User | Role::Assistant | Role::Tool => out.push(message_to_anthropic_json(m)),
        }
    }

    let system = if system_parts.is_empty() {
        None
    } else {
        Some(system_parts.join("\n\n"))
    };

    (system, out)
}

fn message_to_anthropic_json(message: &Message) -> Value {
    match message.role {
        Role::System => unreachable!("system messages should be extracted into top-level `system`"),
        Role::User => json!({
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": message.content,
                }
            ],
        }),
        Role::Assistant => {
            let mut blocks: Vec<Value> = Vec::new();

            if !message.content.is_empty() {
                blocks.push(json!({
                    "type": "text",
                    "text": message.content,
                }));
            }

            if let Some(tool_calls) = &message.tool_calls {
                for tc in tool_calls {
                    blocks.push(tool_call_to_tool_use_block(tc));
                }
            }

            json!({
                "role": "assistant",
                "content": blocks,
            })
        }
        Role::Tool => {
            let tool_use_id = message
                .tool_call_id
                .as_deref()
                .expect("tool messages must include tool_call_id");

            json!({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": message.content,
                    }
                ],
            })
        }
    }
}

fn tool_call_to_tool_use_block(tool_call: &agent_core::tools::ToolCall) -> Value {
    let input: Value = serde_json::from_str(&tool_call.function.arguments)
        .unwrap_or_else(|_| Value::String(tool_call.function.arguments.clone()));

    json!({
        "type": "tool_use",
        "id": tool_call.id,
        "name": tool_call.function.name,
        "input": input,
    })
}

fn tools_to_anthropic_json(tools: &[ToolSchema]) -> Vec<Value> {
    tools
        .iter()
        .map(|t| {
            json!({
                "name": t.function.name,
                "description": t.function.description,
                "input_schema": t.function.parameters,
            })
        })
        .collect()
}

/// Stateful parser for Anthropic SSE streaming events.
///
/// Tracks tool_use blocks by index so we can emit partial ToolCall chunks with correct id/name.
#[derive(Default)]
pub struct AnthropicStreamState {
    tool_uses_by_index: HashMap<usize, (String, String)>, // (id, name)
}

/// Parse a single Anthropic SSE event into an optional LLMChunk.
///
/// Returns:
/// - Ok(Some(chunk)) for text deltas and tool calls
/// - Ok(None) for non-content events (message_start, etc.)
/// - Err for parse errors
pub fn parse_anthropic_sse_event(
    state: &mut AnthropicStreamState,
    event_type: &str,
    data: &str,
) -> Result<Option<LLMChunk>> {
    if data.is_empty() {
        return Ok(None);
    }

    let event: AnthropicSSEEvent =
        serde_json::from_str(data).map_err(|e| LLMError::Stream(format!("Parse error: {}", e)))?;

    match event_type {
        "content_block_start" => {
            if let Some(content_block) = event.content_block {
                if content_block.type_field == "tool_use" {
                    let id = content_block.id.unwrap_or_default();
                    let name = content_block.name.unwrap_or_default();

                    state
                        .tool_uses_by_index
                        .insert(event.index, (id.clone(), name.clone()));

                    return Ok(Some(LLMChunk::ToolCalls(vec![
                        agent_core::tools::ToolCall {
                            id,
                            tool_type: "function".to_string(),
                            function: agent_core::tools::FunctionCall {
                                name,
                                arguments: String::new(),
                            },
                        },
                    ])));
                }
            }
            Ok(None)
        }
        "content_block_delta" => {
            if let Some(delta) = event.delta {
                match delta.type_field.as_str() {
                    "text_delta" => {
                        if let Some(text) = delta.text {
                            return Ok(Some(LLMChunk::Token(text)));
                        }
                    }
                    "input_json_delta" => {
                        if let Some(partial_json) = delta.partial_json {
                            if let Some((id, name)) = state.tool_uses_by_index.get(&event.index) {
                                return Ok(Some(LLMChunk::ToolCalls(vec![
                                    agent_core::tools::ToolCall {
                                        id: id.clone(),
                                        tool_type: "function".to_string(),
                                        function: agent_core::tools::FunctionCall {
                                            name: name.clone(),
                                            arguments: partial_json,
                                        },
                                    },
                                ])));
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(None)
        }
        _ => Ok(None),
    }
}

/// Anthropic SSE event structure (flexible for different event types)
#[derive(Debug, Deserialize)]
struct AnthropicSSEEvent {
    #[serde(rename = "type")]
    type_field: Option<String>,
    index: usize,
    content_block: Option<AnthropicContentBlock>,
    delta: Option<AnthropicDelta>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    type_field: String,
    id: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicDelta {
    #[serde(rename = "type")]
    type_field: String,
    text: Option<String>,
    partial_json: Option<String>,
}

#[cfg(test)]
mod anthropic_request_building {
    use agent_core::tools::{FunctionCall, ToolCall};
    use agent_core::Message;

    #[test]
    fn system_messages_are_extracted_into_top_level_system_field() {
        let messages = vec![
            Message::system("You are helpful."),
            Message::user("Hi"),
            Message::system("Be concise."),
            Message::assistant("Hello!", None),
        ];

        let out = super::build_anthropic_request(&messages, &[], "claude-test", 64, false);

        assert_eq!(out["system"], "You are helpful.\n\nBe concise.");
        assert_eq!(out["messages"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn tool_messages_become_tool_result_blocks() {
        let messages = vec![Message::tool_result("call_1", "OK")];

        let out = super::build_anthropic_request(&messages, &[], "claude-test", 64, false);

        assert_eq!(out["messages"].as_array().unwrap().len(), 1);
        assert_eq!(out["messages"][0]["role"], "user");
        assert_eq!(out["messages"][0]["content"][0]["type"], "tool_result");
        assert_eq!(out["messages"][0]["content"][0]["tool_use_id"], "call_1");
        assert_eq!(out["messages"][0]["content"][0]["content"], "OK");
    }

    #[test]
    fn assistant_tool_calls_become_tool_use_blocks_with_parsed_json_input() {
        let tool_call = ToolCall {
            id: "call_1".to_string(),
            tool_type: "function".to_string(),
            function: FunctionCall {
                name: "search".to_string(),
                arguments: r#"{"q":"test"}"#.to_string(),
            },
        };

        let messages = vec![Message::assistant("", Some(vec![tool_call]))];

        let out = super::build_anthropic_request(&messages, &[], "claude-test", 64, false);

        assert_eq!(out["messages"].as_array().unwrap().len(), 1);
        assert_eq!(out["messages"][0]["role"], "assistant");
        assert_eq!(out["messages"][0]["content"][0]["type"], "tool_use");
        assert_eq!(out["messages"][0]["content"][0]["id"], "call_1");
        assert_eq!(out["messages"][0]["content"][0]["name"], "search");
        assert_eq!(out["messages"][0]["content"][0]["input"]["q"], "test");
    }
}

#[cfg(test)]
mod anthropic_stream_parse {
    use crate::types::LLMChunk;

    #[test]
    fn text_delta_yields_token() {
        let mut state = super::AnthropicStreamState::default();
        let data = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;

        let chunk = super::parse_anthropic_sse_event(&mut state, "content_block_delta", data)
            .unwrap()
            .expect("chunk");

        match chunk {
            LLMChunk::Token(token) => assert_eq!(token, "Hello"),
            other => panic!("expected LLMChunk::Token, got {other:?}"),
        }
    }

    #[test]
    fn tool_use_start_and_input_json_delta_yield_tool_call_parts() {
        let mut state = super::AnthropicStreamState::default();

        let start = r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"search","input":{}}}"#;
        let chunk = super::parse_anthropic_sse_event(&mut state, "content_block_start", start)
            .unwrap()
            .expect("chunk");

        match chunk {
            LLMChunk::ToolCalls(calls) => {
                assert_eq!(calls.len(), 1);
                assert_eq!(calls[0].id, "toolu_1");
                assert_eq!(calls[0].function.name, "search");
                assert!(calls[0].function.arguments.is_empty());
            }
            other => panic!("expected LLMChunk::ToolCalls, got {other:?}"),
        }

        let delta1 = r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"q\":\"te"}}"#;
        let chunk = super::parse_anthropic_sse_event(&mut state, "content_block_delta", delta1)
            .unwrap()
            .expect("chunk");

        match chunk {
            LLMChunk::ToolCalls(calls) => {
                assert_eq!(calls.len(), 1);
                assert_eq!(calls[0].id, "toolu_1");
                assert_eq!(calls[0].function.name, "search");
                assert_eq!(calls[0].function.arguments, r#"{"q":"te"#);
            }
            other => panic!("expected LLMChunk::ToolCalls, got {other:?}"),
        }

        let delta2 = r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"st\"}"}}"#;
        let chunk = super::parse_anthropic_sse_event(&mut state, "content_block_delta", delta2)
            .unwrap()
            .expect("chunk");

        match chunk {
            LLMChunk::ToolCalls(calls) => {
                assert_eq!(calls.len(), 1);
                assert_eq!(calls[0].id, "toolu_1");
                assert_eq!(calls[0].function.name, "search");
                assert_eq!(calls[0].function.arguments, "st\"}");
            }
            other => panic!("expected LLMChunk::ToolCalls, got {other:?}"),
        }
    }
}
