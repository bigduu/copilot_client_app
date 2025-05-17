use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize, Clone, PartialEq)]
pub struct Message {
    pub role: String,
    pub content: String,
}

impl Message {
    pub fn system(content: String) -> Self {
        Self {
            role: "system".to_string(),
            content,
        }
    }

    pub fn user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
        }
    }
    pub fn assistant(content: String) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
        }
    }
    pub fn developer(content: String) -> Self {
        Self {
            role: "developer".to_string(),
            content,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u64>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
}

impl ChatCompletionRequest {
    pub fn new_stream(model: String, messages: Vec<Message>) -> Self {
        Self {
            model,
            messages,
            n: Some(1),
            stream: true,
            temperature: Some(0.3),
            top_p: Some(1.0),
            max_tokens: Some(8000),
        }
    }

    pub fn new_block(model: String, messages: Vec<Message>) -> Self {
        Self {
            model,
            messages,
            n: None,
            stream: false,
            temperature: None,
            top_p: None,
            max_tokens: Some(8000),
        }
    }
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CopilotConfig {
    pub annotations_enabled: bool,
    pub chat_enabled: bool,
    pub chat_jetbrains_enabled: bool,
    pub code_quote_enabled: bool,
    pub code_review_enabled: bool,
    pub codesearch: bool,
    pub copilotignore_enabled: bool,
    pub endpoints: Endpoints,
    pub expires_at: u64,
    pub individual: bool,
    pub limited_user_quotas: Option<String>,
    pub limited_user_reset_date: Option<String>,
    pub prompt_8k: bool,
    pub public_suggestions: String,
    pub refresh_in: u64,
    pub sku: String,
    pub snippy_load_test_enabled: bool,
    pub telemetry: String,
    pub token: String,
    pub tracking_id: String,
    pub vsc_electron_fetcher_v2: bool,
    pub xcode: bool,
    pub xcode_chat: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct Endpoints {
    pub api: Option<String>,
    pub origin_tracker: Option<String>,
    pub proxy: Option<String>,
    pub telemetry: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<u64>,
    pub interval: Option<u64>,
    pub scope: Option<String>,
    pub error: Option<String>,
}
impl AccessTokenResponse {
    pub(crate) fn from_token(token: String) -> Self {
        Self {
            access_token: Some(token),
            token_type: None,
            expires_in: None,
            interval: None,
            scope: None,
            error: None,
        }
    }
}

/// A chunk in a streaming response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    /// The ID of this chunk
    pub id: String,
    /// The object type (always "chat.completion.chunk")
    pub object: Option<String>,
    /// Unix timestamp of when the chunk was created
    pub created: u64,
    /// The model that generated this chunk
    pub model: Option<String>,
    /// Array of choices (usually just one) in this chunk
    pub choices: Vec<StreamChoice>,
}

/// A choice in a streaming response chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChoice {
    /// Index of this choice
    pub index: usize,
    /// The delta (changes) in this chunk
    pub delta: StreamDelta,
    /// Reason why this chunk ended, if it did
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

/// The changes in a streaming response chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    /// Role of the message (usually only in first chunk)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// Content of the message (the actual token)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Function call, if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<FunctionCall>,
}
/// A function call in a message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    /// Name of the function to call
    pub name: String,
    /// Arguments to pass to the function, as a JSON string
    pub arguments: String,
}
