use async_trait::async_trait;
use log::{debug, error, info};
use serde_json::Value;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::copilot::model::stream_model::Message;
use crate::copilot::{CopilotClient, StreamChunk};
use crate::tools::{Parameter, ToolManager};

use super::Processor;

pub struct ToolsProcessor {
    enabled: bool,
    copilot_client: Arc<CopilotClient>,
    tool_manager: Arc<ToolManager>,
}

impl ToolsProcessor {
    pub fn new(copilot_client: Arc<CopilotClient>, tool_manager: Arc<ToolManager>) -> Self {
        Self {
            enabled: true,
            copilot_client,
            tool_manager,
        }
    }
}

#[async_trait]
impl Processor for ToolsProcessor {
    fn enabled(&self) -> bool {
        self.enabled
    }

    fn order(&self) -> usize {
        1 // Order 1 means it runs after McpProcessor (order 0)
    }

    async fn process(&self, messages: Vec<Message>, channel: &Channel<String>) -> Vec<Message> {
        // Check if we have messages and the last message is from the user
        if messages.is_empty() || messages.last().unwrap().role != "user" {
            return messages;
        }

        // Get the tools list
        let tools_info = self.tool_manager.list_tools();
        debug!("Available tools: {}", tools_info);

        // Create a system message with tools information
        let system_prompt = format!(
            "You have access to these tools: {}. If the user message requires using one of these tools, respond with '{{\"use_tool\": true, \"tool_name\": \"TOOL_NAME\", \"parameters\": [{{\"name\": \"PARAM_NAME\", \"value\": \"PARAM_VALUE\"}}]}}'. Otherwise, respond with '{{\"use_tool\": false}}'.",
            tools_info
        );

        // Create a new message list with the system prompt
        let mut llm_query_messages = Vec::new();

        // Add the system message first
        llm_query_messages.push(Message::system(system_prompt.clone()));

        // Add the original messages (except for the system message if any)
        for msg in &messages {
            if msg.role != "system" {
                llm_query_messages.push(msg.clone());
            }
        }

        debug!("LLM query messages: {:?}", llm_query_messages);

        // Ask the LLM if we should use a tool
        let ask_llm_content = format!(
            "Asking LLM if a local tool should be used. System Prompt: '{}'. Query Messages: {:?}",
            system_prompt,      // Already defined
            llm_query_messages  // Already defined
        );
        let update_msg = format!(
            "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": {}}}",
            serde_json::to_string(&ask_llm_content)
                .unwrap_or_else(|_| "\"Error serializing content\"".to_string())
        );
        channel
            .send(update_msg)
            .unwrap_or_else(|e| error!("Failed to send tools status: {:?}", e));
        let (rx, _handle) = self
            .copilot_client
            .send_stream_request(llm_query_messages, None)
            .await;

        // Process the response from the LLM
        let mut llm_response = String::new();
        let mut rx_channel = rx;

        while let Some(chunk_result) = rx_channel.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    let chunk_str = String::from_utf8_lossy(&chunk);
                    let chunk: StreamChunk = serde_json::from_str(&chunk_str).unwrap();
                    if !chunk.choices.is_empty() {
                        let choice = chunk.choices[0].clone();
                        if choice.delta.content.is_some() {
                            llm_response.push_str(&choice.delta.content.unwrap());
                        }
                    }
                }
                Err(e) => {
                    error!("Error receiving LLM response: {:?}", e);
                    return messages;
                }
            }
        }

        info!("LLM decision response: {}", llm_response);

        // Parse the JSON response
        let llm_decision: Result<Value, _> = serde_json::from_str(&llm_response);

        match llm_decision {
            Ok(decision) => {
                // Check if the LLM decided to use a tool
                if let Some(use_tool) = decision.get("use_tool").and_then(|v| v.as_bool()) {
                    if use_tool {
                        // Extract tool name
                        let tool_name = match decision.get("tool_name") {
                            Some(name) => name.as_str().unwrap_or("").to_string(),
                            None => {
                                error!("Missing tool_name in LLM decision");
                                return messages;
                            }
                        };

                        // Extract parameters
                        let parameters = match decision.get("parameters") {
                            Some(params) => {
                                if let Some(params_array) = params.as_array() {
                                    let mut result = Vec::new();
                                    for param in params_array {
                                        if let (Some(name), Some(value)) = (
                                            param.get("name").and_then(|v| v.as_str()),
                                            param.get("value").and_then(|v| v.as_str()),
                                        ) {
                                            result.push(Parameter {
                                                name: name.to_string(),
                                                description: "".to_string(), // Not needed for execution
                                                required: true, // Not needed for execution
                                                value: value.to_string(),
                                            });
                                        }
                                    }
                                    result
                                } else {
                                    Vec::new()
                                }
                            }
                            None => Vec::new(),
                        };

                        info!(
                            "Executing tool: {} with parameters: {:?}",
                            tool_name, parameters
                        );

                        // Send update before executing local tool
                        let exec_tool_content = format!(
                            "Executing local tool: '{}' with parameters: {:?}",
                            tool_name,  // Already defined
                            parameters  // Already defined
                        );
                        let update_msg = format!(
                            "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": {}}}",
                            serde_json::to_string(&exec_tool_content).unwrap_or_else(|_| "\"Error serializing content\"".to_string())
                        );
                        channel
                            .send(update_msg)
                            .unwrap_or_else(|e| error!("Failed to send tools status: {:?}", e));

                        // Execute the tool (we need to get the tool from the manager)
                        let tool_result = self
                            .execute_tool(tool_name.clone(), parameters.clone())
                            .await;

                        match tool_result {
                            Ok(result) => {
                                debug!("Tool execution result: {}", result);
                                // Create a new message with the result
                                let tool_success_content = format!(
                                    "Local tool '{}' execution successful. Result: {}",
                                    tool_name, // from the Ok(result) block's outer scope
                                    result     // from the Ok(result) block
                                );
                                let update_msg = format!(
                                    "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": {}}}",
                                    serde_json::to_string(&tool_success_content).unwrap_or_else(|_| "\"Error serializing content\"".to_string())
                                );
                                channel.send(update_msg).unwrap_or_else(|e| {
                                    error!("Failed to send tools status: {:?}", e)
                                });
                                let mut result_messages = messages.clone();
                                result_messages.push(Message::developer(format!(
                                    "Tool {} execution result:\n```\n{}\n```",
                                    tool_name, result
                                )));
                                return result_messages;
                            }
                            Err(err) => {
                                error!("Error executing tool: {:?}", err);
                                let tool_failure_content = format!(
                                    "Local tool '{}' execution failed. Error: {:?}",
                                    tool_name, // from the Err(err) block's outer scope
                                    err
                                );
                                let update_msg = format!(
                                    "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": {}}}",
                                    serde_json::to_string(&tool_failure_content).unwrap_or_else(|_| "\"Error serializing content\"".to_string())
                                );
                                channel.send(update_msg).unwrap_or_else(|e| {
                                    error!("Failed to send tools status: {:?}", e)
                                });
                                let mut result_messages = messages.clone();
                                result_messages.push(Message::developer(format!(
                                    "Error executing tool {}: {}",
                                    tool_name, err
                                )));
                                return result_messages;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("Failed to parse LLM decision: {:?}", e);
                return messages;
            }
        }

        // If we couldn't identify a tool request or LLM decided not to use tools, return the original messages
        messages
    }
}

impl ToolsProcessor {
    async fn execute_tool(
        &self,
        tool_name: String,
        parameters: Vec<Parameter>,
    ) -> anyhow::Result<String> {
        // Get the tool manager
        let tool_manager = &self.tool_manager;

        // Get the tool by name
        if let Some(tool) = tool_manager.get_tool(&tool_name) {
            // Execute the tool with the given parameters
            tool.execute(parameters).await
        } else {
            Err(anyhow::anyhow!("Tool not found: {}", tool_name))
        }
    }
}
