use std::sync::Arc;

use crate::copilot::model::stream_model::Message;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
pub mod mcp_proceeor;
pub mod tools_processor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub tool_type: String, // "mcp" or "local"
    pub tool_name: String,
    pub parameters: serde_json::Value,
    pub requires_approval: bool,
}

#[async_trait]
pub trait Processor: Send + Sync {
    fn enabled(&self) -> bool;
    fn order(&self) -> usize;

    /// Enhance the system prompt with tool information
    async fn enhance_system_prompt(&self, messages: &mut Vec<Message>) -> Result<(), String>;

    /// Extract and execute tool calls from LLM response content
    async fn extract_and_execute_tools(
        &self,
        content: &str,
        channel: &tauri::ipc::Channel<String>,
    ) -> Result<Option<String>, String>;

    /// Legacy method for backward compatibility - will be removed
    async fn process(
        &self,
        messages: Vec<Message>,
        channel: &tauri::ipc::Channel<String>,
    ) -> Vec<Message> {
        messages
    }
}

pub struct ProcessorManager {
    processors: Vec<Arc<dyn Processor>>,
}

impl ProcessorManager {
    pub fn new(processors: Vec<Arc<dyn Processor>>) -> Self {
        let mut processors = processors;
        processors.sort_by_key(|p| p.order());
        Self { processors }
    }

    pub fn add_processor(&mut self, processor: Arc<dyn Processor>) {
        self.processors.push(processor);
        self.processors.sort_by_key(|p| p.order());
    }

    /// Enhanced system prompts with tool information
    pub async fn enhance_system_prompts(&self, messages: &mut Vec<Message>) -> Result<(), String> {
        for processor in self.processors.iter() {
            if processor.enabled() {
                processor.enhance_system_prompt(messages).await?;
            }
        }
        Ok(())
    }

    /// Process tool calls from LLM response
    pub async fn process_tool_calls(
        &self,
        content: &str,
        channel: &tauri::ipc::Channel<String>,
    ) -> Result<Option<String>, String> {
        for processor in self.processors.iter() {
            if processor.enabled() {
                if let Some(result) = processor
                    .extract_and_execute_tools(content, channel)
                    .await?
                {
                    return Ok(Some(result));
                }
            }
        }
        Ok(None)
    }

    /// Legacy method for backward compatibility
    pub async fn process(
        &self,
        messages: Vec<Message>,
        channel: &tauri::ipc::Channel<String>,
    ) -> Vec<Message> {
        let mut messages = messages;
        for processor in self.processors.iter() {
            if processor.enabled() {
                messages = processor.process(messages, channel).await;
            }
        }
        messages
    }
}

pub fn pop_last_message(messages: Vec<Message>) -> (Option<Message>, Vec<Message>) {
    let mut messages = messages;
    let last_message = messages.pop();
    (last_message, messages)
}

/// Helper function to find and modify system message, or create one if it doesn't exist
pub fn append_to_system_message(messages: &mut Vec<Message>, content_to_append: &str) {
    // Find existing system message
    if let Some(system_msg) = messages.iter_mut().find(|msg| msg.role == "system") {
        // Append to existing system message
        system_msg.content.push_str("\n\n");
        system_msg.content.push_str(content_to_append);
    } else {
        // Create new system message at the beginning
        let system_msg = Message::system(format!("你是一个AI助手。\n\n{}", content_to_append));
        messages.insert(0, system_msg);
    }
}

/// Helper function to parse tool calls from content
pub fn parse_tool_calls_from_content(content: &str) -> Vec<ToolCall> {
    let mut tool_calls = Vec::new();

    // Try to find JSON blocks in the content
    if let Some(json_start) = content.find('{') {
        if let Some(json_end) = content.rfind('}') {
            if json_end > json_start {
                let json_str = &content[json_start..=json_end];

                // Try to parse as tool call
                if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(use_tool) = json_value.get("use_tool").and_then(|v| v.as_bool()) {
                        if use_tool {
                            if let Some(tool_name) =
                                json_value.get("tool_name").and_then(|v| v.as_str())
                            {
                                let tool_type = json_value
                                    .get("tool_type")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("unknown");
                                let parameters = json_value
                                    .get("parameters")
                                    .unwrap_or(&serde_json::Value::Object(Default::default()))
                                    .clone();

                                let requires_approval = json_value
                                    .get("requires_approval")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(true); // Default to requiring approval for safety

                                tool_calls.push(ToolCall {
                                    tool_type: tool_type.to_string(),
                                    tool_name: tool_name.to_string(),
                                    parameters,
                                    requires_approval,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    tool_calls
}
