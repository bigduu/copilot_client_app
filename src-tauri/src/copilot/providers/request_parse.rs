use async_trait::async_trait;
use bytes::Bytes;
use llm_proxy_core::{Error, RequestParser};
use llm_proxy_openai::ChatCompletionRequest;

/// Parser for `OpenAI` chat completion requests
pub struct JsonRequestParser;

impl Default for JsonRequestParser {
    fn default() -> Self {
        Self::new()
    }
}

impl JsonRequestParser {
    /// Create a new `OpenAI` request parser with the given route configuration
    pub const fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl RequestParser<ChatCompletionRequest> for JsonRequestParser {
    async fn parse(&self, body: Bytes) -> Result<ChatCompletionRequest, Error> {
        let request: ChatCompletionRequest = serde_json::from_slice(&body)
            .map_err(|e| Error::ParseError(format!("Failed to parse request JSON: {e}")))?;

        Ok(request)
    }
}
