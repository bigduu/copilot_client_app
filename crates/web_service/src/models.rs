use serde::{Deserialize, Serialize};
use tool_system::types::DisplayPreference;

// Models for OpenAI compatibility
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: OpenAIContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenAIContent {
    Text(String),
    // TODO: Add support for image content if needed
}

impl From<copilot_client::model::stream_model::Message> for OpenAIMessage {
    fn from(msg: copilot_client::model::stream_model::Message) -> Self {
        let content = OpenAIContent::Text(msg.get_text_content());
        Self {
            role: msg.role,
            content,
        }
    }
}

impl From<OpenAIMessage> for copilot_client::model::stream_model::Message {
    fn from(msg: OpenAIMessage) -> Self {
        let content_text = match msg.content {
            OpenAIContent::Text(text) => text,
        };
        copilot_client::model::stream_model::Message {
            role: msg.role,
            content: copilot_client::model::stream_model::MessageContent::Text(content_text),
            images: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChatCompletionRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<OpenAIChoice>,
    pub usage: Option<OpenAIUsage>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIStreamChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<OpenAIChoice>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIChoice {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<OpenAIDelta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize)]
pub struct OpenAIModelsResponse {
    pub object: String,
    pub data: Vec<OpenAIModel>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIModel {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub owned_by: String,
}

#[derive(Debug, Serialize)]
pub struct OpenAIError {
    pub error: OpenAIErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct OpenAIErrorDetail {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub code: Option<String>,
}

// Models for Tool Service
#[derive(Serialize)]
pub struct ParameterInfo {
    pub name: String,
    pub description: String,
    pub required: bool,
    #[serde(rename = "type")]
    pub param_type: String,
}

#[derive(Serialize)]
pub struct ToolUIInfo {
    pub name: String,
    pub description: String,
    pub parameters: Vec<ParameterInfo>,
    pub tool_type: String,
    pub parameter_parsing_strategy: String,
    pub parameter_regex: Option<String>,
    pub ai_prompt_template: Option<String>,
    pub hide_in_selector: bool,
    pub display_preference: DisplayPreference,
    pub required_approval: bool,
}

#[derive(Serialize)]
pub struct ToolsUIResponse {
    pub tools: Vec<ToolUIInfo>,
    pub is_strict_mode: bool,
}

#[derive(serde::Deserialize, Debug)]
pub struct ParameterValue {
    pub name: String,
    pub value: String,
}

#[derive(serde::Deserialize)]
pub struct ToolExecutionRequest {
    pub tool_name: String,
    pub parameters: Vec<ParameterValue>,
}

#[derive(Serialize)]
pub struct ToolExecutionResult {
    pub result: String,
    pub display_preference: DisplayPreference,
}
