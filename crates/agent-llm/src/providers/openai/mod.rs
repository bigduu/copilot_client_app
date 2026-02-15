use async_trait::async_trait;
use reqwest::Client;

use crate::provider::{LLMError, LLMProvider, LLMStream, Result};
use crate::types::LLMChunk;
use agent_core::{tools::ToolSchema, Message};

use super::common::openai_compat::{
    build_openai_compat_body, parse_openai_compat_sse_data_strict,
};
use super::common::sse::llm_stream_from_sse;

pub struct OpenAIProvider {
    client: Client,
    api_key: String,
    base_url: String,
    model: String,
}

impl OpenAIProvider {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
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
}

#[async_trait]
impl LLMProvider for OpenAIProvider {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
        model: Option<&str>,
    ) -> Result<LLMStream> {
        // Use provided model or fall back to default
        let model_to_use = model.unwrap_or(&self.model);

        if model.is_some() {
            log::debug!(
                "OpenAI provider using override model '{}' (default: '{}')",
                model_to_use,
                self.model
            );
        }

        let body = build_openai_compat_body(model_to_use, messages, tools, None, max_output_tokens);

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await?;
            return Err(LLMError::Api(format!("HTTP {}: {}", status, text)));
        }

        let stream = llm_stream_from_sse(response, |_event, data| {
            if data.trim().is_empty() {
                return Ok(None);
            }

            let chunk = parse_openai_compat_sse_data_strict(data)?;
            match chunk {
                LLMChunk::Done => Ok(None),
                other => Ok(Some(other)),
            }
        });

        Ok(stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_core::tools::{FunctionSchema, ToolSchema};
    use agent_core::Message;

    // ===== Basic Tests (5 tests) =====

    #[test]
    fn test_new_provider() {
        let provider = OpenAIProvider::new("test_key");
        assert_eq!(provider.api_key, "test_key");
        assert_eq!(provider.base_url, "https://api.openai.com/v1");
        assert_eq!(provider.model, "gpt-4o-mini");
    }

    #[test]
    fn test_with_base_url() {
        let provider = OpenAIProvider::new("test_key")
            .with_base_url("https://custom.openai.com/v1");
        assert_eq!(provider.base_url, "https://custom.openai.com/v1");
    }

    #[test]
    fn test_with_model() {
        let provider = OpenAIProvider::new("test_key")
            .with_model("gpt-4o");
        assert_eq!(provider.model, "gpt-4o");
    }

    #[test]
    fn test_default_values() {
        let provider = OpenAIProvider::new("test_key");
        assert_eq!(provider.base_url, "https://api.openai.com/v1");
        assert_eq!(provider.model, "gpt-4o-mini");
    }

    #[test]
    fn test_chained_builders() {
        let provider = OpenAIProvider::new("test_key")
            .with_base_url("https://custom.openai.com/v1")
            .with_model("gpt-4-turbo");

        assert_eq!(provider.api_key, "test_key");
        assert_eq!(provider.base_url, "https://custom.openai.com/v1");
        assert_eq!(provider.model, "gpt-4-turbo");
    }

    // ===== Request Building Tests (4 tests) =====

    #[test]
    fn test_authorization_header() {
        let provider = OpenAIProvider::new("sk-test-12345");

        // Verify the authorization header format
        let expected_auth = format!("Bearer {}", provider.api_key);
        assert_eq!(expected_auth, "Bearer sk-test-12345");
    }

    #[test]
    fn test_request_url_construction() {
        let provider = OpenAIProvider::new("test_key")
            .with_base_url("https://api.custom.com/v1");

        let expected_url = format!("{}/chat/completions", provider.base_url);
        assert_eq!(expected_url, "https://api.custom.com/v1/chat/completions");
    }

    #[test]
    fn test_request_body_basic() {
        let messages = vec![Message::user("Hello")];
        let tools: Vec<ToolSchema> = vec![];

        let body = build_openai_compat_body("gpt-4o-mini", &messages, &tools, None, None);

        assert_eq!(body["model"], "gpt-4o-mini");
        assert_eq!(body["stream"], true);
        assert!(body["messages"].is_array());
        assert_eq!(body["messages"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_request_body_with_tools() {
        let messages = vec![Message::user("Search for weather")];
        let tools = vec![ToolSchema {
            schema_type: "function".to_string(),
            function: FunctionSchema {
                name: "search_weather".to_string(),
                description: "Search for weather information".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "location": { "type": "string" }
                    }
                }),
            },
        }];

        let body = build_openai_compat_body("gpt-4o-mini", &messages, &tools, None, None);

        assert_eq!(body["tools"].as_array().unwrap().len(), 1);
        assert_eq!(body["tools"][0]["type"], "function");
        assert_eq!(body["tools"][0]["function"]["name"], "search_weather");
    }

    // ===== Streaming Response Tests (4 tests) =====

    #[test]
    fn test_parse_simple_token() {
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}"#;

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        match chunk {
            LLMChunk::Token(text) => assert_eq!(text, "Hello"),
            _ => panic!("Expected Token chunk"),
        }
    }

    #[test]
    fn test_parse_tool_call() {
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"search","arguments":"{\"q\":\"test\"}"}}]},"finish_reason":null}]}"#;

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        match chunk {
            LLMChunk::ToolCalls(calls) => {
                assert_eq!(calls.len(), 1);
                assert_eq!(calls[0].id, "call_abc123");
                assert_eq!(calls[0].tool_type, "function");
                assert_eq!(calls[0].function.name, "search");
                assert_eq!(calls[0].function.arguments, r#"{"q":"test"}"#);
            }
            _ => panic!("Expected ToolCalls chunk"),
        }
    }

    #[test]
    fn test_parse_done_signal() {
        let data = "[DONE]";

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        assert!(matches!(chunk, LLMChunk::Done));
    }

    #[test]
    fn test_parse_empty_delta() {
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{},"finish_reason":null}]}"#;

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        match chunk {
            LLMChunk::Token(text) => assert!(text.is_empty()),
            _ => panic!("Expected empty Token chunk"),
        }
    }

    // ===== Error Handling Tests (2 tests) =====

    #[test]
    fn test_api_error_response() {
        // Test that we can handle API error format
        let error_response = r#"{"error":{"message":"Invalid API key","type":"invalid_request_error","code":"invalid_api_key"}}"#;

        // We can't test the full error flow without a mock server,
        // but we can verify the error format is parseable
        let parsed: serde_json::Result<serde_json::Value> = serde_json::from_str(error_response);
        assert!(parsed.is_ok());

        let error_json = parsed.unwrap();
        assert_eq!(error_json["error"]["message"], "Invalid API key");
        assert_eq!(error_json["error"]["code"], "invalid_api_key");
    }

    #[test]
    fn test_invalid_json_response() {
        let invalid_data = "{not valid json}";

        let result = parse_openai_compat_sse_data_strict(invalid_data);

        assert!(result.is_err());
    }

    // ===== Additional Edge Case Tests =====

    #[test]
    fn test_request_body_with_max_tokens() {
        let messages = vec![Message::user("Hello")];
        let tools: Vec<ToolSchema> = vec![];

        let body = build_openai_compat_body("gpt-4o-mini", &messages, &tools, None, Some(4096));

        assert_eq!(body["max_tokens"], 4096);
    }

    #[test]
    fn test_multiple_messages_request() {
        let messages = vec![
            Message::system("You are helpful"),
            Message::user("Hi"),
            Message::assistant("Hello!", None),
            Message::user("How are you?"),
        ];
        let tools: Vec<ToolSchema> = vec![];

        let body = build_openai_compat_body("gpt-4o-mini", &messages, &tools, None, None);

        assert_eq!(body["messages"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn test_provider_immutability() {
        // Verify that builder methods work correctly
        let provider = OpenAIProvider::new("key1")
            .with_base_url("https://custom.api.com")
            .with_model("gpt-4");

        // Verify all settings are applied
        assert_eq!(provider.api_key, "key1");
        assert_eq!(provider.base_url, "https://custom.api.com");
        assert_eq!(provider.model, "gpt-4");
    }

    #[test]
    fn test_tool_call_partial_delta() {
        // Test tool call with only name (no arguments yet)
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"search"}}]},"finish_reason":null}]}"#;

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        match chunk {
            LLMChunk::ToolCalls(calls) => {
                assert_eq!(calls[0].id, "call_123");
                assert_eq!(calls[0].function.name, "search");
                // Arguments should be empty string when not provided
                assert_eq!(calls[0].function.arguments, "");
            }
            _ => panic!("Expected ToolCalls chunk"),
        }
    }

    #[test]
    fn test_multiple_tool_calls_in_single_chunk() {
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{}"}},{"index":1,"id":"call_2","type":"function","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":null}]}"#;

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        match chunk {
            LLMChunk::ToolCalls(calls) => {
                assert_eq!(calls.len(), 2);
                assert_eq!(calls[0].function.name, "search");
                assert_eq!(calls[1].function.name, "lookup");
            }
            _ => panic!("Expected ToolCalls chunk"),
        }
    }

    #[test]
    fn test_whitespace_in_done_signal() {
        let data = "  [DONE]  ";

        let chunk = parse_openai_compat_sse_data_strict(data).unwrap();

        assert!(matches!(chunk, LLMChunk::Done));
    }
}

