use async_trait::async_trait;
use crate::tools::{ToolCall, ToolResult, ToolSchema};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ToolError {
    #[error("Tool not found: {0}")]
    NotFound(String),
    
    #[error("Execution failed: {0}")]
    Execution(String),
    
    #[error("Invalid arguments: {0}")]
    InvalidArguments(String),
}

pub type Result<T> = std::result::Result<T, ToolError>;

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(&self, call: &ToolCall) -> Result<ToolResult>;
    fn list_tools(&self) -> Vec<ToolSchema>;
}
