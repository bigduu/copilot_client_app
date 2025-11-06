use std::sync::Arc;

use context_manager::{
    ChatContext, ContentPart, InternalMessage, MessageType, PreparedLlmRequest, Role,
};
use tokio::sync::RwLock;

use copilot_client::api::models::{
    ChatCompletionRequest, ChatMessage, Content, FunctionCall, Role as ClientRole,
};

use crate::error::AppError;
use crate::services::system_prompt_enhancer::SystemPromptEnhancer;
use crate::services::system_prompt_service::SystemPromptService;

#[derive(Clone, Debug)]
pub struct BuiltLlmRequest {
    pub prepared: PreparedLlmRequest,
    pub request: ChatCompletionRequest,
}

pub struct LlmRequestBuilder {
    system_prompt_enhancer: Arc<SystemPromptEnhancer>,
    system_prompt_service: Arc<SystemPromptService>,
}

impl LlmRequestBuilder {
    pub fn new(
        system_prompt_enhancer: Arc<SystemPromptEnhancer>,
        system_prompt_service: Arc<SystemPromptService>,
    ) -> Self {
        Self {
            system_prompt_enhancer,
            system_prompt_service,
        }
    }

    pub async fn build(
        &self,
        context: &Arc<RwLock<ChatContext>>,
    ) -> Result<BuiltLlmRequest, AppError> {
        let prepared = {
            let context_lock = context.read().await;
            context_lock.prepare_llm_request()
        };

        let base_prompt = if let Some(prompt) = prepared.branch_system_prompt.as_ref() {
            Some(prompt.content.clone())
        } else if let Some(prompt_id) = prepared.system_prompt_id.as_ref() {
            match self.system_prompt_service.get_prompt(prompt_id).await {
                Some(prompt) => Some(prompt.content),
                None => {
                    log::warn!("System prompt {} not found", prompt_id);
                    None
                }
            }
        } else {
            None
        };

        let enhanced_prompt = if let Some(ref base_prompt) = base_prompt {
            match self
                .system_prompt_enhancer
                .enhance_prompt(base_prompt, &prepared.agent_role)
                .await
            {
                Ok(enhanced) => {
                    log::info!(
                        "System prompt enhanced successfully for role: {:?}",
                        prepared.agent_role
                    );
                    Some(enhanced)
                }
                Err(e) => {
                    log::warn!("Failed to enhance system prompt: {}, using base prompt", e);
                    Some(base_prompt.clone())
                }
            }
        } else {
            None
        };

        let mut chat_messages: Vec<ChatMessage> = prepared
            .messages
            .iter()
            .map(convert_to_chat_message)
            .collect();

        if let Some(prompt) = enhanced_prompt {
            chat_messages.insert(
                0,
                ChatMessage {
                    role: ClientRole::System,
                    content: Content::Text(prompt),
                    tool_calls: None,
                    tool_call_id: None,
                },
            );
            log::info!("Enhanced system prompt injected into messages");
        }

        let request = ChatCompletionRequest {
            model: prepared.model_id.clone(),
            messages: chat_messages,
            stream: None,
            tools: None,
            tool_choice: None,
            ..Default::default()
        };

        Ok(BuiltLlmRequest { prepared, request })
    }
}

fn convert_to_chat_message(msg: &InternalMessage) -> ChatMessage {
    let tool_calls = msg.tool_calls.as_ref().map(|calls| {
        calls
            .iter()
            .map(|call| {
                let arguments =
                    serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".to_string());

                copilot_client::api::models::ToolCall {
                    id: call.id.clone(),
                    tool_type: "function".to_string(),
                    function: FunctionCall {
                        name: call.tool_name.clone(),
                        arguments,
                    },
                }
            })
            .collect()
    });

    let role = if msg.role == Role::Tool && msg.message_type == MessageType::ToolResult {
        ClientRole::Assistant
    } else {
        convert_role(&msg.role)
    };

    ChatMessage {
        role,
        content: convert_content(&msg.content),
        tool_calls,
        tool_call_id: msg.tool_result.as_ref().map(|tr| tr.request_id.clone()),
    }
}

fn convert_role(role: &Role) -> ClientRole {
    match role {
        Role::User => ClientRole::User,
        Role::Assistant => ClientRole::Assistant,
        Role::System => ClientRole::System,
        Role::Tool => ClientRole::Tool,
    }
}

fn convert_content(parts: &[ContentPart]) -> Content {
    if parts.len() == 1 {
        if let Some(ContentPart::Text { text }) = parts.first() {
            return Content::Text(text.clone());
        }
    }

    let client_parts: Vec<copilot_client::api::models::ContentPart> = parts
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text { text } => {
                Some(copilot_client::api::models::ContentPart::Text { text: text.clone() })
            }
            ContentPart::Image { url, detail } => {
                Some(copilot_client::api::models::ContentPart::ImageUrl {
                    image_url: copilot_client::api::models::ImageUrl {
                        url: url.clone(),
                        detail: detail.clone(),
                    },
                })
            }
        })
        .collect();

    Content::Parts(client_parts)
}
