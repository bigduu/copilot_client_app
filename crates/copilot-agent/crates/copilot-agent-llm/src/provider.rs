use async_trait::async_trait;
use futures::Stream;
use crate::types::LLMChunk;
use copilot_agent_core::{Message, tools::ToolSchema};
use thiserror::Error;
use std::pin::Pin;

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
}

pub type Result<T> = std::result::Result<T, LLMError>;

pub type LLMStream = Pin<Box<dyn Stream<Item = Result<LLMChunk>> + Send>>;

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
    ) -> Result<LLMStream>;
}
