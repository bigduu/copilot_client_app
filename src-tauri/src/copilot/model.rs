use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub n: u64,
    pub stream: bool,
    pub temperature: f64,
    pub top_p: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
}

impl ChatCompletionRequest {
    pub fn new(model: String, messages: Vec<Message>) -> Self {
        Self {
            model,
            messages,
            n: 1,
            stream: true,
            temperature: 0.3,
            top_p: 1.0,
            max_tokens: Some(8000),
        }
    }
}
#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct CopilotConfig {
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
pub(super) struct Endpoints {
    pub api: Option<String>,
    pub origin_tracker: Option<String>,
    pub proxy: Option<String>,
    pub telemetry: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<u64>,
    pub interval: Option<u64>,
    pub scope: Option<String>,
    pub error: Option<String>,
}
impl AccessTokenResponse {
    pub(super) fn from_token(token: String) -> Self {
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
