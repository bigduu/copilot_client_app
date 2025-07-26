use serde::{Deserialize, Serialize};

// OpenAI-compatible request models
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: OpenAIContent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum OpenAIContent {
    Text(String),
    Array(Vec<OpenAIContentPart>),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIContentPart {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: Option<String>,
    pub image_url: Option<OpenAIImageUrl>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAIImageUrl {
    pub url: String,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChatCompletionRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub stream: Option<bool>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub stop: Option<Vec<String>>,
}

// OpenAI-compatible response models
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<OpenAIChoice>,
    pub usage: Option<OpenAIUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChoice {
    pub index: u32,
    pub message: Option<OpenAIMessage>,
    pub delta: Option<OpenAIDelta>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIStreamChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<OpenAIChoice>,
}

// Models endpoint response
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIModelsResponse {
    pub object: String,
    pub data: Vec<OpenAIModel>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIModel {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub owned_by: String,
}

// Error response
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIError {
    pub error: OpenAIErrorDetail,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIErrorDetail {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub code: Option<String>,
}

// Conversion functions from internal models to OpenAI format
impl From<crate::copilot::model::stream_model::Message> for OpenAIMessage {
    fn from(msg: crate::copilot::model::stream_model::Message) -> Self {
        let content = match msg.content {
            crate::copilot::model::stream_model::MessageContent::Text(text) => {
                OpenAIContent::Text(text)
            }
            crate::copilot::model::stream_model::MessageContent::Array(parts) => {
                let openai_parts: Vec<OpenAIContentPart> = parts
                    .into_iter()
                    .map(|part| {
                        if part.content_type == "text" {
                            OpenAIContentPart {
                                content_type: "text".to_string(),
                                text: part.text,
                                image_url: None,
                            }
                        } else if part.content_type == "image_url" {
                            OpenAIContentPart {
                                content_type: "image_url".to_string(),
                                text: None,
                                image_url: part.image_url.map(|img| OpenAIImageUrl {
                                    url: img.url,
                                    detail: img.detail,
                                }),
                            }
                        } else {
                            OpenAIContentPart {
                                content_type: part.content_type,
                                text: part.text,
                                image_url: None,
                            }
                        }
                    })
                    .collect();
                OpenAIContent::Array(openai_parts)
            }
        };

        OpenAIMessage {
            role: msg.role,
            content,
        }
    }
}

impl From<OpenAIMessage> for crate::copilot::model::stream_model::Message {
    fn from(msg: OpenAIMessage) -> Self {
        let content = match msg.content {
            OpenAIContent::Text(text) => {
                crate::copilot::model::stream_model::MessageContent::Text(text)
            }
            OpenAIContent::Array(parts) => {
                let internal_parts: Vec<crate::copilot::model::stream_model::ContentPart> = parts
                    .into_iter()
                    .map(|part| crate::copilot::model::stream_model::ContentPart {
                        content_type: part.content_type,
                        text: part.text,
                        image_url: part.image_url.map(|img| {
                            crate::copilot::model::stream_model::ImageUrl {
                                url: img.url,
                                detail: img.detail,
                            }
                        }),
                    })
                    .collect();
                crate::copilot::model::stream_model::MessageContent::Array(internal_parts)
            }
        };

        crate::copilot::model::stream_model::Message {
            role: msg.role,
            content,
            images: None,
        }
    }
}
