use std::collections::HashMap;

use context_manager::{
    structs::{
        context::ChatContext,
        message::{ContentPart as InternalContentPart, Role},
        tool::ToolCallRequest,
    },
    traits::adapter::Adapter,
};
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<String>, // "auto" is a common value
    #[serde(flatten)]
    pub parameters: HashMap<String, serde_json::Value>, // For temperature, top_p, etc.
}

#[derive(Serialize, Debug)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "is_default")]
    pub content: Content,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

// Helper to avoid serializing empty content
fn is_default<T: Default + PartialEq>(t: &T) -> bool {
    *t == T::default()
}

#[derive(Serialize, Debug, PartialEq, Default)]
#[serde(untagged)]
pub enum Content {
    #[default]
    None,
    Text(String),
    Parts(Vec<ContentPart>),
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    ImageUrl { image_url: ImageUrl },
}

#[derive(Serialize, Debug, PartialEq)]
pub struct ImageUrl {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct Tool {
    #[serde(rename = "type")]
    pub tool_type: String, // Always "function" for now
    pub function: Function,
}

#[derive(Serialize, Debug)]
pub struct Function {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub parameters: serde_json::Value, // JSON Schema object
}

#[derive(Serialize, Debug)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub tool_type: String, // Always "function"
    pub function: ToolCallFunction,
}

#[derive(Serialize, Debug)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String, // JSON string of arguments
}

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
                role: "system".to_string(),
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
                Role::User => {
                    let content = if internal_message.content.len() == 1 {
                        if let Some(InternalContentPart::Text(text)) =
                            internal_message.content.first()
                        {
                            Content::Text(text.clone())
                        } else {
                            // Should be a single image part, handle as Parts
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
                        role: "user".to_string(),
                        content,
                        tool_calls: None,
                        tool_call_id: None,
                    }
                }
                Role::Assistant => {
                    let mut tool_calls = None;
                    let mut content = Content::None;

                    if let Some(tool_call_requests) = &internal_message.tool_calls {
                        tool_calls = Some(
                            tool_call_requests
                                .iter()
                                .map(|req: &ToolCallRequest| ToolCall {
                                    id: req.id.clone(),
                                    tool_type: "function".to_string(),
                                    function: ToolCallFunction {
                                        name: req.tool_name.clone(),
                                        arguments: serde_json::to_string(&req.arguments)
                                            .unwrap_or_default(),
                                    },
                                })
                                .collect(),
                        );
                    } else if !internal_message.content.is_empty() {
                        // Assistant message has text content
                        if let Some(InternalContentPart::Text(text)) =
                            internal_message.content.first()
                        {
                            content = Content::Text(text.clone());
                        }
                    }

                    ChatMessage {
                        role: "assistant".to_string(),
                        content,
                        tool_calls,
                        tool_call_id: None,
                    }
                }
                Role::Tool => {
                    if let Some(tool_result) = &internal_message.tool_result {
                        ChatMessage {
                            role: "tool".to_string(),
                            content: Content::Text(tool_result.result.to_string()),
                            tool_calls: None,
                            tool_call_id: Some(tool_result.request_id.clone()),
                        }
                    } else {
                        continue; // Skip if tool role has no result
                    }
                }
                // System messages are handled before this loop.
                // If we encounter one here, it's likely a mistake or an edge case.
                // For now, we'll just ignore it to prevent a panic.
                Role::System => continue,
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
        };

        Ok(request)
    }
}

fn convert_content_part(part: &InternalContentPart) -> ContentPart {
    match part {
        InternalContentPart::Text(text) => ContentPart::Text {
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

#[cfg(test)]
mod tests {
    use super::*;
    use context_manager::structs::{
        branch::SystemPrompt,
        context::ChatContext,
        message::{ContentPart as InternalContentPart, InternalMessage, MessageNode, Role},
        tool::{ToolCallRequest, ToolCallResult},
    };
    use tool_system::types::ToolArguments;
    use serde_json::json;
    use uuid::Uuid;

    // Helper to create a basic ChatContext for testing
    fn create_test_context(model_id: &str) -> ChatContext {
        let mut context = ChatContext::new(Uuid::new_v4(), model_id.to_string(), "test".to_string());
        context.config.parameters.insert("temperature".to_string(), json!(0.9));
        context
    }

    fn add_message(context: &mut ChatContext, message: InternalMessage) -> Uuid {
        let message_id = Uuid::new_v4();
        let node = MessageNode {
            id: message_id,
            message,
            parent_id: context.get_active_branch().unwrap().message_ids.last().cloned(),
        };
        context.message_pool.insert(message_id, node);
        context.get_active_branch_mut().unwrap().message_ids.push(message_id);
        message_id
    }

    #[test]
    fn test_basic_conversion() {
        let mut context = create_test_context("gpt-4");
        add_message(
            &mut context,
            InternalMessage {
                role: Role::User,
                content: vec![InternalContentPart::Text("Hello".to_string())],
                ..Default::default()
            },
        );
        add_message(
            &mut context,
            InternalMessage {
                role: Role::Assistant,
                content: vec![InternalContentPart::Text("Hi there!".to_string())],
                ..Default::default()
            },
        );

        let adapter = OpenAIAdapter;
        let request = adapter.adapt(&context).unwrap();

        assert_eq!(request.model, "gpt-4");
        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.messages[0].role, "user");
        assert_eq!(request.messages[0].content, Content::Text("Hello".to_string()));
        assert_eq!(request.messages[1].role, "assistant");
        assert_eq!(request.messages[1].content, Content::Text("Hi there!".to_string()));
        assert_eq!(request.parameters["temperature"], 0.9);
    }

    #[test]
    fn test_system_prompt_conversion() {
        let mut context = create_test_context("gpt-3.5-turbo");
        let active_branch = context.get_active_branch_mut().unwrap();
        active_branch.system_prompt = Some(SystemPrompt {
            id: "sp_123".to_string(),
            content: "You are a helpful assistant.".to_string(),
        });

        add_message(
            &mut context,
            InternalMessage {
                role: Role::User,
                content: vec![InternalContentPart::Text("What's the weather?".to_string())],
                ..Default::default()
            },
        );

        let adapter = OpenAIAdapter;
        let request = adapter.adapt(&context).unwrap();

        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.messages[0].role, "system");
        assert_eq!(
            request.messages[0].content,
            Content::Text("You are a helpful assistant.".to_string())
        );
        assert_eq!(request.messages[1].role, "user");
    }

    #[test]
    fn test_tool_call_request_conversion() {
        let mut context = create_test_context("gpt-4-tools");
        let tool_call_id = "call_123".to_string();
        let tool_name = "get_weather".to_string();
        let arguments = json!({"location": "Boston"});

        add_message(
            &mut context,
            InternalMessage {
                role: Role::Assistant,
                tool_calls: Some(vec![ToolCallRequest {
                    id: tool_call_id.clone(),
                    tool_name: tool_name.clone(),
                    arguments: ToolArguments::Json(arguments.clone()),
                    approval_status: context_manager::structs::tool::ApprovalStatus::Pending,
                }]),
                ..Default::default()
            },
        );

        let adapter = OpenAIAdapter;
        let request = adapter.adapt(&context).unwrap();

        assert_eq!(request.messages.len(), 1);
        let assistant_msg = &request.messages[0];
        assert_eq!(assistant_msg.role, "assistant");
        assert!(assistant_msg.tool_calls.is_some());
        let tool_calls = assistant_msg.tool_calls.as_ref().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, tool_call_id);
        assert_eq!(tool_calls[0].function.name, tool_name);
        assert_eq!(tool_calls[0].function.arguments, arguments.to_string());
    }

    #[test]
    fn test_tool_call_result_conversion() {
        let mut context = create_test_context("gpt-4");
        let request_id = "call_abc".to_string();
        let result = json!({"temperature": "72F"});

        add_message(
            &mut context,
            InternalMessage {
                role: Role::Tool,
                tool_result: Some(ToolCallResult {
                    request_id: request_id.clone(),
                    result: result.clone(),
                }),
                ..Default::default()
            },
        );

        let adapter = OpenAIAdapter;
        let request = adapter.adapt(&context).unwrap();

        assert_eq!(request.messages.len(), 1);
        let tool_msg = &request.messages[0];
        assert_eq!(tool_msg.role, "tool");
        assert_eq!(tool_msg.tool_call_id, Some(request_id));
        assert_eq!(tool_msg.content, Content::Text(result.to_string()));
    }

    #[test]
    fn test_image_content_conversion() {
        let mut context = create_test_context("gpt-4-vision-preview");
        let image_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==".to_string();

        add_message(
            &mut context,
            InternalMessage {
                role: Role::User,
                content: vec![
                    InternalContentPart::Text("What is in this image?".to_string()),
                    InternalContentPart::Image {
                        url: image_url.clone(),
                        detail: Some("high".to_string()),
                    },
                ],
                ..Default::default()
            },
        );

        let adapter = OpenAIAdapter;
        let request = adapter.adapt(&context).unwrap();

        assert_eq!(request.messages.len(), 1);
        let user_msg = &request.messages[0];
        assert_eq!(user_msg.role, "user");

        match &user_msg.content {
            Content::Parts(parts) => {
                assert_eq!(parts.len(), 2);
                assert_eq!(
                    parts[0],
                    ContentPart::Text {
                        text: "What is in this image?".to_string()
                    }
                );
                assert_eq!(
                    parts[1],
                    ContentPart::ImageUrl {
                        image_url: ImageUrl {
                            url: image_url,
                            detail: Some("high".to_string())
                        }
                    }
                );
            }
            _ => panic!("Expected multi-part content"),
        }
    }

    #[test]
    fn test_configuration_mapping() {
        let mut context = create_test_context("test-model");
        context.config.parameters.insert("temperature".to_string(), json!(0.5));
        context.config.parameters.insert("top_p".to_string(), json!(0.9));

        let adapter = OpenAIAdapter;
        let request = adapter.adapt(&context).unwrap();

        assert_eq!(request.model, "test-model");
        assert_eq!(request.parameters.get("temperature").unwrap(), &json!(0.5));
        assert_eq!(request.parameters.get("top_p").unwrap(), &json!(0.9));
    }
}