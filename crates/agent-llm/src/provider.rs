use crate::types::LLMChunk;
use agent_core::{tools::ToolSchema, Message};
use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LLMError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Stream error: {0}")]
    Stream(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Protocol conversion error: {0}")]
    Protocol(#[from] crate::protocol::ProtocolError),
}

pub type Result<T> = std::result::Result<T, LLMError>;

pub type LLMStream = Pin<Box<dyn Stream<Item = Result<LLMChunk>> + Send>>;

#[async_trait]
pub trait LLMProvider: Send + Sync {
    /// Stream chat completion
    ///
    /// # Arguments
    /// * `messages` - Chat messages
    /// * `tools` - Available tools
    /// * `max_output_tokens` - Maximum output tokens
    /// * `model` - Optional model override. If None, uses the provider's default model
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
        model: Option<&str>,
    ) -> Result<LLMStream>;

    /// List available models
    async fn list_models(&self) -> Result<Vec<String>> {
        // Default implementation returns empty list
        Ok(vec![])
    }
}
