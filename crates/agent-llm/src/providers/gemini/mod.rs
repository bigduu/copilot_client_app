//! Google Gemini provider implementation.

mod stream;

pub use stream::{GeminiStreamState, parse_gemini_sse_event};

use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;

use crate::provider::{LLMError, LLMProvider, LLMStream, Result};
use crate::protocol::gemini::{GeminiRequest};
use agent_core::{tools::ToolSchema, Message};
use crate::protocol::ToProvider;

/// Google Gemini API provider.
pub struct GeminiProvider {
    client: Client,
    api_key: String,
    base_url: String,
    model: String,
}

impl GeminiProvider {
    /// Create a new Gemini provider with an API key.
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.into(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
            model: "gemini-pro".to_string(),
        }
    }

    /// Set a custom base URL (e.g., for proxies or alternative endpoints).
    pub fn with_base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = url.into();
        self
    }

    /// Set the model name (e.g., "gemini-pro", "gemini-pro-vision").
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }
}

#[async_trait]
impl LLMProvider for GeminiProvider {
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
                "Gemini provider using override model '{}' (default: '{}')",
                model_to_use,
                self.model
            );
        }

        // Convert messages using the new protocol system
        let messages_vec: Vec<Message> = messages.to_vec();
        let mut request: GeminiRequest = messages_vec.to_provider()?;

        // Add tools if present
        if !tools.is_empty() {
            let tools_vec: Vec<ToolSchema> = tools.to_vec();
            request.tools = Some(tools_vec.to_provider()?);
        }

        // Add generation config if max_output_tokens is specified
        if let Some(max_tokens) = max_output_tokens {
            request.generation_config = Some(json!({
                "maxOutputTokens": max_tokens
            }));
        }

        log::debug!("Gemini request: {}", serde_json::to_string_pretty(&request).unwrap_or_default());

        // Build URL with query param authentication
        let url = format!(
            "{}/models/{}:streamGenerateContent?key={}",
            self.base_url, model_to_use, self.api_key
        );

        // Send request
        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(LLMError::Http)?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.map_err(LLMError::Http)?;

            if status == 401 || status == 403 {
                return Err(LLMError::Auth(format!(
                    "Gemini authentication failed: {}. Please check your API key.",
                    text
                )));
            }

            return Err(LLMError::Api(format!(
                "Gemini API error: HTTP {}: {}",
                status, text
            )));
        }

        log::debug!("Gemini stream started successfully");

        // Parse SSE stream with Gemini-specific parser
        let mut state = GeminiStreamState::default();

        let stream = crate::providers::common::sse::llm_stream_from_sse(response, move |event, data| {
            parse_gemini_sse_event(&mut state, event, data)
        });

        Ok(stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_provider() {
        let provider = GeminiProvider::new("test_key");
        assert_eq!(provider.api_key, "test_key");
        assert_eq!(provider.base_url, "https://generativelanguage.googleapis.com/v1beta");
        assert_eq!(provider.model, "gemini-pro");
    }

    #[test]
    fn test_with_base_url() {
        let provider = GeminiProvider::new("test_key")
            .with_base_url("https://custom.googleapis.com/v1");
        assert_eq!(provider.base_url, "https://custom.googleapis.com/v1");
    }

    #[test]
    fn test_with_model() {
        let provider = GeminiProvider::new("test_key")
            .with_model("gemini-pro-vision");
        assert_eq!(provider.model, "gemini-pro-vision");
    }

    #[test]
    fn test_chained_builders() {
        let provider = GeminiProvider::new("test_key")
            .with_base_url("https://custom.api.com")
            .with_model("gemini-ultra");

        assert_eq!(provider.api_key, "test_key");
        assert_eq!(provider.base_url, "https://custom.api.com");
        assert_eq!(provider.model, "gemini-ultra");
    }

    #[test]
    fn test_url_construction() {
        let provider = GeminiProvider::new("my_api_key_123")
            .with_base_url("https://test.api.com/v1beta")
            .with_model("gemini-custom");

        // This verifies URL construction logic
        let expected_url = "https://test.api.com/v1beta/models/gemini-custom:streamGenerateContent?key=my_api_key_123";
        let constructed_url = format!(
            "{}/models/{}:streamGenerateContent?key={}",
            provider.base_url, provider.model, provider.api_key
        );

        assert_eq!(constructed_url, expected_url);
    }
}
