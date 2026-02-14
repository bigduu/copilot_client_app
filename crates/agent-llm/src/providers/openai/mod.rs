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
    ) -> Result<LLMStream> {
        let body = build_openai_compat_body(&self.model, messages, tools, None, max_output_tokens);

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

