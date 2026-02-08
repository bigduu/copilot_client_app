//! Anthropic API Models
//!
//! Request and response types for Anthropic API compatibility.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Anthropic Messages API Request
#[derive(Deserialize, Debug, Clone)]
pub struct AnthropicMessagesRequest {
    pub model: String,
    pub messages: Vec<AnthropicMessage>,
    #[serde(default)]
    pub system: Option<AnthropicSystem>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub stop_sequences: Option<Vec<String>>,
    #[serde(default)]
    pub stream: Option<bool>,
    #[serde(default)]
    pub tools: Option<Vec<AnthropicTool>>,
    #[serde(default)]
    pub tool_choice: Option<AnthropicToolChoice>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// Anthropic Message
#[derive(Deserialize, Debug, Clone)]
pub struct AnthropicMessage {
    pub role: AnthropicRole,
    pub content: AnthropicContent,
}

/// Anthropic Role
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum AnthropicRole {
    User,
    Assistant,
    System,
}

/// Anthropic Content (text or blocks)
#[derive(Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicContentBlock>),
}

/// Anthropic Content Block
#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnthropicContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        content: Value,
    },
}

/// Anthropic System Prompt
#[derive(Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum AnthropicSystem {
    Text(String),
    Blocks(Vec<AnthropicSystemBlock>),
}

/// Anthropic System Block
#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnthropicSystemBlock {
    Text { text: String },
}

/// Anthropic Tool Definition
#[derive(Deserialize, Debug, Clone)]
pub struct AnthropicTool {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub input_schema: Value,
}

/// Anthropic Tool Choice
#[derive(Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum AnthropicToolChoice {
    String(String),
    Tool {
        #[serde(rename = "type")]
        tool_type: String,
        name: String,
    },
}

/// Anthropic Complete API Request (legacy)
#[derive(Deserialize, Debug, Clone)]
pub struct AnthropicCompleteRequest {
    pub model: String,
    pub prompt: String,
    pub max_tokens_to_sample: u32,
    #[serde(default)]
    pub stop_sequences: Option<Vec<String>>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub top_k: Option<u32>,
    #[serde(default)]
    pub stream: Option<bool>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// Anthropic Messages API Response
#[derive(Serialize, Debug, Clone)]
pub struct AnthropicMessagesResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub response_type: String,
    pub role: String,
    pub content: Vec<AnthropicResponseContentBlock>,
    pub model: String,
    pub stop_reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_sequence: Option<String>,
    pub usage: AnthropicUsage,
}

/// Anthropic Response Content Block
#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnthropicResponseContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
}

/// Anthropic Usage Information
#[derive(Serialize, Debug, Clone)]
pub struct AnthropicUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// Anthropic Complete API Response (legacy)
#[derive(Serialize, Debug, Clone)]
pub struct AnthropicCompleteResponse {
    #[serde(rename = "type")]
    pub response_type: String,
    pub completion: String,
    pub model: String,
    pub stop_reason: String,
}

/// Anthropic Error Response
#[derive(Serialize, Debug, Clone)]
pub struct AnthropicErrorEnvelope {
    #[serde(rename = "type")]
    pub error_type: String,
    pub error: AnthropicErrorDetail,
}

/// Anthropic Error Detail
#[derive(Serialize, Debug, Clone)]
pub struct AnthropicErrorDetail {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
}

/// Anthropic Error
#[derive(Debug, Clone)]
pub struct AnthropicError {
    pub status: u16,
    pub error_type: String,
    pub message: String,
}

impl AnthropicError {
    pub fn new(status: u16, error_type: &str, message: String) -> Self {
        Self {
            status,
            error_type: error_type.to_string(),
            message,
        }
    }
}

impl std::fmt::Display for AnthropicError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.error_type, self.message)
    }
}

impl std::error::Error for AnthropicError {}
