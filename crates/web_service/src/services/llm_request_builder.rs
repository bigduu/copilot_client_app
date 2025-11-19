use std::sync::Arc;

use context_manager::{
    ChatContext, ContentPart, InternalMessage, MessageType, PreparedLlmRequest, Role,
};
use tokio::sync::RwLock;

use copilot_client::api::models::{
    ChatCompletionRequest, ChatMessage, Content, FunctionCall, FunctionDefinition,
    Role as ClientRole, Tool,
};

use crate::error::AppError;
use crate::services::system_prompt_service::SystemPromptService;

#[derive(Clone, Debug)]
pub struct BuiltLlmRequest {
    pub prepared: PreparedLlmRequest,
    pub request: ChatCompletionRequest,
}

pub struct LlmRequestBuilder {
    system_prompt_service: Arc<SystemPromptService>,
}

impl LlmRequestBuilder {
    /// Create a new LlmRequestBuilder (Phase 2.0 - Pipeline-based)
    ///
    /// Note: SystemPromptEnhancer is no longer used. System prompt enhancement
    /// is now handled by the Pipeline architecture in ChatContext.
    pub fn new(system_prompt_service: Arc<SystemPromptService>) -> Self {
        Self {
            system_prompt_service,
        }
    }

    /// Build an LLM request using Pipeline-enhanced system prompt (Phase 2.0)
    ///
    /// This method:
    /// 1. Calls ChatContext.prepare_llm_request_async() to get Pipeline-enhanced prompt
    /// 2. Falls back to SystemPromptService if no enhanced prompt is available
    /// 3. Converts messages to ChatCompletionRequest format
    ///
    /// # Arguments
    /// * `context` - The ChatContext to build the request from
    ///
    /// # Returns
    /// * `Ok(BuiltLlmRequest)` - The built request ready to send to LLM
    /// * `Err(AppError)` - If building fails
    pub async fn build(
        &self,
        context: &Arc<RwLock<ChatContext>>,
    ) -> Result<BuiltLlmRequest, AppError> {
        // Use Pipeline-enhanced prepare_llm_request_async (Phase 2.0)
        let prepared = {
            let mut context_lock = context.write().await;
            context_lock.prepare_llm_request_async().await
        };

        // Determine final system prompt
        // Priority: Pipeline enhanced > Branch prompt > SystemPromptService
        let final_prompt = if let Some(enhanced) = prepared.enhanced_system_prompt.as_ref() {
            log::info!(
                "Using Pipeline-enhanced system prompt (length: {})",
                enhanced.len()
            );
            Some(enhanced.clone())
        } else if let Some(prompt) = prepared.branch_system_prompt.as_ref() {
            log::info!("Using branch system prompt (no Pipeline enhancement)");
            Some(prompt.content.clone())
        } else if let Some(prompt_id) = prepared.system_prompt_id.as_ref() {
            match self.system_prompt_service.get_prompt(prompt_id).await {
                Some(prompt) => {
                    log::info!("Using system prompt from service: {}", prompt_id);
                    Some(prompt.content)
                }
                None => {
                    log::warn!("System prompt {} not found", prompt_id);
                    None
                }
            }
        } else {
            None
        };

        // Convert internal messages to chat messages
        let mut chat_messages: Vec<ChatMessage> = prepared
            .messages
            .iter()
            .map(convert_to_chat_message)
            .collect();

        // Inject system prompt as first message if available
        if let Some(prompt) = final_prompt {
            chat_messages.insert(
                0,
                ChatMessage {
                    role: ClientRole::System,
                    content: Content::Text(prompt),
                    tool_calls: None,
                    tool_call_id: None,
                },
            );
            log::info!("System prompt injected into messages");
        }

        // Convert available tools to API format
        let tools: Option<Vec<Tool>> = if prepared.available_tools.is_empty() {
            None
        } else {
            Some(
                prepared
                    .available_tools
                    .iter()
                    .map(|tool_def| Tool {
                        tool_type: "function".to_string(),
                        function: FunctionDefinition {
                            name: tool_def.name.clone(),
                            description: Some(tool_def.description.clone()),
                            parameters: tool_def.parameters_schema.clone(),
                        },
                    })
                    .collect(),
            )
        };

        if let Some(ref tools_list) = tools {
            log::info!("Sending {} tools to LLM", tools_list.len());
        }

        let request = ChatCompletionRequest {
            model: prepared.model_id.clone(),
            messages: chat_messages,
            stream: None,
            tools,
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
