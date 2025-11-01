use crate::api::models::{
    ChatCompletionRequest, ChatMessage, Content, ContentPart, FunctionCall, ImageUrl,
    Role as ApiRole, ToolCall,
};
use context_manager::{
    structs::{
        context::ChatContext,
        message::{ContentPart as InternalContentPart, Role as InternalRole},
        tool::ToolCallRequest,
    },
    traits::adapter::Adapter,
};

pub struct OpenAIAdapter;

impl Adapter for OpenAIAdapter {
    type RequestBody = ChatCompletionRequest;

    fn adapt(&self, context: &ChatContext) -> Result<Self::RequestBody, String> {
        let active_branch = context
            .get_active_branch()
            .ok_or("No active branch found in context")?;

        let mut messages = Vec::new();

        // 1. Handle System Prompt
        if let Some(system_prompt) = &active_branch.system_prompt {
            messages.push(ChatMessage {
                role: ApiRole::System,
                content: Content::Text(system_prompt.content.clone()),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 2. Process Message History
        for message_id in &active_branch.message_ids {
            let message_node = context
                .message_pool
                .get(message_id)
                .ok_or(format!("Message with ID '{}' not found in pool", message_id))?;

            let internal_message = &message_node.message;

            let chat_message = match internal_message.role {
                InternalRole::User => {
                    let content = if internal_message.content.len() == 1 {
                        if let Some(InternalContentPart::Text { text }) =
                            internal_message.content.first()
                        {
                            Content::Text(text.clone())
                        } else {
                            Content::Parts(
                                internal_message
                                    .content
                                    .iter()
                                    .map(convert_content_part)
                                    .collect(),
                            )
                        }
                    } else {
                        Content::Parts(
                            internal_message
                                .content
                                .iter()
                                .map(convert_content_part)
                                .collect(),
                        )
                    };
                    ChatMessage {
                        role: ApiRole::User,
                        content,
                        tool_calls: None,
                        tool_call_id: None,
                    }
                }
                InternalRole::Assistant => {
                    let mut tool_calls = None;
                    let mut content_parts = Vec::new();

                    if let Some(tool_call_requests) = &internal_message.tool_calls {
                        tool_calls = Some(
                            tool_call_requests
                                .iter()
                                .map(|req: &ToolCallRequest| ToolCall {
                                    id: req.id.clone(),
                                    tool_type: "function".to_string(),
                                    function: FunctionCall {
                                        name: req.tool_name.clone(),
                                        arguments: serde_json::to_string(&req.arguments)
                                            .unwrap_or_default(),
                                    },
                                })
                                .collect(),
                        );
                    }

                    for part in &internal_message.content {
                        if let InternalContentPart::Text { text } = part {
                            content_parts.push(ContentPart::Text { text: text.clone() });
                        }
                    }

                    let content = if content_parts.is_empty() && tool_calls.is_some() {
                        // OpenAI requires content to be present for assistant messages with tool calls,
                        // even if it's an empty string.
                        Content::Text("".to_string())
                    } else if content_parts.len() == 1 {
                        // If there's only one text part, represent it as a simple text content.
                        if let Some(ContentPart::Text { text }) = content_parts.into_iter().next() {
                            Content::Text(text)
                        } else {
                            // This case should ideally not be reached if we only push Text parts.
                            Content::Text("".to_string())
                        }
                    } else {
                        Content::Parts(content_parts)
                    };

                    ChatMessage {
                        role: ApiRole::Assistant,
                        content,
                        tool_calls,
                        tool_call_id: None,
                    }
                }
                InternalRole::Tool => {
                    if let Some(tool_result) = &internal_message.tool_result {
                        ChatMessage {
                            role: ApiRole::Tool,
                            content: Content::Text(tool_result.result.to_string()),
                            tool_calls: None,
                            tool_call_id: Some(tool_result.request_id.clone()),
                        }
                    } else {
                        continue; // Skip if tool role has no result
                    }
                }
                InternalRole::System => continue,
            };
            messages.push(chat_message);
        }

        // 3. Construct Final Request
        let request = ChatCompletionRequest {
            model: context.config.model_id.clone(),
            messages,
            parameters: context.config.parameters.clone(),
            tools: None,      // As per spec, handled by enhancer
            tool_choice: None, // As per spec, handled by enhancer
            stream: None, // Default to None, can be set by caller
        };

        Ok(request)
    }
}

fn convert_content_part(part: &InternalContentPart) -> ContentPart {
    match part {
        InternalContentPart::Text { text } => ContentPart::Text {
            text: text.clone(),
        },
        InternalContentPart::Image { url, detail } => ContentPart::ImageUrl {
            image_url: ImageUrl {
                url: url.clone(),
                detail: detail.clone(),
            },
        },
    }
}

// Tests will be refactored in a subsequent step once the main logic is updated.
// The existing tests are now incompatible due to the model changes.