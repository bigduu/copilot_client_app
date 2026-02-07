use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use crate::provider::{LLMProvider, LLMError, Result, LLMStream};
use crate::types::LLMChunk;
use bamboo_core::{Message, tools::ToolSchema};

pub struct OpenAIProvider {
    client: Client,
    api_key: String,
    base_url: String,
    model: String,
}

impl OpenAIProvider {
    fn build_client() -> Client {
        std::panic::catch_unwind(Client::new).unwrap_or_else(|_| {
            Client::builder()
                .no_proxy()
                .build()
                .expect("Failed to build HTTP client")
        })
    }

    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Self::build_client(),
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

    fn build_request_body(&self, messages: &[Message], tools: &[ToolSchema]) -> serde_json::Value {
        serde_json::json!({
            "model": self.model,
            "messages": messages,
            "stream": true,
            "tools": tools,
        })
    }
}

#[async_trait]
impl LLMProvider for OpenAIProvider {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
    ) -> Result<LLMStream> {
        let body = self.build_request_body(messages, tools);
        
        let response = self.client
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

        let stream = response
            .bytes_stream()
            .eventsource()
            .map(|event| {
                let event = event.map_err(|e| LLMError::Stream(e.to_string()))?;
                
                if event.data == "[DONE]" {
                    return Ok(LLMChunk::Done);
                }

                let chunk: OpenAIStreamChunk = serde_json::from_str(&event.data)
                    .map_err(LLMError::Json)?;

                Ok(parse_chunk(chunk))
            })
            .filter_map(|result| async move {
                match result {
                    Ok(LLMChunk::Done) => None,
                    Ok(chunk) => Some(Ok(chunk)),
                    Err(e) => Some(Err(e)),
                }
            });

        Ok(Box::pin(stream))
    }
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamChunk {
    #[allow(dead_code)]
    id: String,
    choices: Vec<OpenAIChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    delta: OpenAIDelta,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct OpenAIDelta {
    content: Option<String>,
    #[allow(dead_code)]
    role: Option<String>,
    tool_calls: Option<Vec<OpenAIToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIToolCallDelta {
    #[allow(dead_code)]
    index: usize,
    id: Option<String>,
    #[serde(rename = "type")]
    tool_type: Option<String>,
    function: Option<OpenAIFunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct OpenAIFunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

fn parse_chunk(chunk: OpenAIStreamChunk) -> LLMChunk {
    if let Some(choice) = chunk.choices.first() {
        if let Some(tool_calls) = &choice.delta.tool_calls {
            LLMChunk::ToolCalls(tool_calls.iter().map(|tc| {
                bamboo_core::tools::ToolCall {
                    id: tc.id.clone().unwrap_or_default(),
                    tool_type: tc.tool_type.clone().unwrap_or_else(|| "function".to_string()),
                    function: bamboo_core::tools::FunctionCall {
                        name: tc.function.as_ref().and_then(|f| f.name.clone()).unwrap_or_default(),
                        arguments: tc.function.as_ref().and_then(|f| f.arguments.clone()).unwrap_or_default(),
                    },
                }
            }).collect())
        } else if let Some(content) = &choice.delta.content {
            LLMChunk::Token(content.clone())
        } else {
            LLMChunk::Token(String::new())
        }
    } else {
        LLMChunk::Token(String::new())
    }
}
