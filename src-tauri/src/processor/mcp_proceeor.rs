use async_trait::async_trait;
use log::{debug, error, info};
use rmcp::model::CallToolRequestParam;
use serde_json::{Map, Value};
use std::borrow::Cow;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::copilot::model::stream_model::Message;
use crate::copilot::{CopilotClient, StreamChunk};
use crate::mcp::client::get_global_manager;

use super::Processor;

pub struct McpProcessor {
    enabled: bool,
    copilot_client: Arc<CopilotClient>,
}

impl McpProcessor {
    pub fn new(copilot_client: Arc<CopilotClient>) -> Self {
        Self {
            enabled: true,
            copilot_client,
        }
    }
}

#[async_trait]
impl Processor for McpProcessor {
    fn enabled(&self) -> bool {
        self.enabled
    }

    fn order(&self) -> usize {
        0
    }

    async fn process(&self, messages: Vec<Message>, channel: &Channel<String>) -> Vec<Message> {
        // Check if we have messages and the last message is from the user
        if messages.is_empty() || messages.last().unwrap().role != "user" {
            return messages;
        }

        // Get the global MCP client manager and check status
        let manager = match get_global_manager() {
            Some(manager) => manager,
            None => {
                error!("MCP client manager not initialized");
                return messages;
            }
        };

        // Get the list of available tools from the MCP server
        let tools_result = manager.get_all_clients_tools_list().await;
        let tools_info = match tools_result {
            Ok(tools) => {
                debug!("Available MCP tools: {:?}", tools);
                format!("Available MCP tools: {:?}", tools)
            }
            Err(e) => {
                error!("Failed to list MCP tools: {:?}", e);
                return messages;
            }
        };

        // Create a system message with MCP tools information
        let system_prompt = format!(
            "You have access to these external tools: {}. If the user message requires using one of these tools, respond with '{{\"use_tool\": true, \"tool_name\": \"TOOL_NAME\", \"arguments\": {{...}}}}'. Otherwise, respond with '{{\"use_tool\": false}}'.",
            tools_info
        );

        debug!("System prompt: {}", system_prompt);

        // Create a new message list with the system prompt
        let mut llm_query_messages = Vec::new();

        // Add the system message first
        llm_query_messages.push(Message::system(system_prompt));

        // Add the original messages (except for the system message if any)
        for msg in &messages {
            if msg.role != "system" {
                llm_query_messages.push(msg.clone());
            }
        }

        debug!("LLM query messages: {:?}", llm_query_messages);

        // Ask the LLM if we should use a tool
        let ask_llm_content =
            format!(
            "Asking LLM if a MCP tool should be used. System Prompt: '{}'. Query Messages: {:?}",
            llm_query_messages.iter().find(|m| m.role == "system").map_or("".to_string(), |m| m.content.clone()), // Safely get system_prompt content
            llm_query_messages.iter().filter(|m| m.role != "system").collect::<Vec<&Message>>() // Get user/assistant messages
        );
        let update_msg = format!(
            "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": {}}}",
            serde_json::to_string(&ask_llm_content)
                .unwrap_or_else(|_| "\"Error serializing content\"".to_string())
        );
        channel
            .send(update_msg)
            .unwrap_or_else(|e| error!("Failed to send MCP status: {:?}", e));
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
                        // Extract tool name and arguments
                        let tool_name = match decision.get("tool_name") {
                            Some(name) => name.as_str().unwrap_or("").to_string(),
                            None => {
                                error!("Missing tool_name in LLM decision");
                                return messages;
                            }
                        };

                        let arguments = match decision.get("arguments") {
                            Some(args) => {
                                if let Some(obj) = args.as_object() {
                                    obj.clone()
                                } else {
                                    Map::new()
                                }
                            }
                            None => Map::new(),
                        };

                        info!(
                            "Executing MCP tool: {} with args: {:?}",
                            tool_name, arguments
                        );

                        // Create the tool call request with proper types
                        let param = CallToolRequestParam {
                            name: Cow::Owned(tool_name.clone()),
                            arguments: Some(arguments.clone()),
                        };

                        // Send update before executing MCP tool
                        let exec_tool_content = format!(
                            "Executing MCP tool: '{}' with arguments: {:?}",
                            tool_name, arguments
                        );
                        let update_msg = format!(
                            "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": {}}}",
                            serde_json::to_string(&exec_tool_content).unwrap_or_else(|_| "\"Error serializing content\"".to_string())
                        );
                        channel
                            .send(update_msg)
                            .unwrap_or_else(|e| error!("Failed to send MCP status: {:?}", e));

                        // Call the tool
                        match manager
                            .get_client_by_tools(tool_name.as_str())
                            .unwrap()
                            .call_tool(param)
                            .await
                        {
                            Ok(result) => {
                                debug!("Tool call result: {:?}", result);

                                // Create a new message with the result
                                let mut result_messages = messages.clone();

                                // Use the correct field from CallToolResult
                                let response_content = if result.is_error.unwrap_or(false) {
                                    format!(
                                        "Error from tool {}: {:?}",
                                        tool_name.clone(),
                                        result.content
                                    )
                                } else {
                                    format!("```json\n{:?}\n```", result.content)
                                };

                                let tool_success_content = format!(
                                    "MCP tool '{}' execution successful. Result: {:?}",
                                    tool_name, result.content
                                );
                                let update_msg = format!(
                                    "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": {}}}",
                                    serde_json::to_string(&tool_success_content).unwrap_or_else(|_| "\"Error serializing content\"".to_string())
                                );
                                channel.send(update_msg).unwrap_or_else(|e| {
                                    error!("Failed to send MCP status: {:?}", e)
                                });
                                result_messages.push(Message::developer(response_content));
                                return result_messages;
                            }
                            Err(err) => {
                                error!("Error calling MCP tool: {:?}", err);
                                let mut result_messages = messages.clone();
                                let tool_failure_content = format!(
                                    "MCP tool '{}' execution failed. Error: {:?}",
                                    tool_name, err
                                );
                                let update_msg = format!(
                                    "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": {}}}",
                                    serde_json::to_string(&tool_failure_content).unwrap_or_else(|_| "\"Error serializing content\"".to_string())
                                );
                                channel.send(update_msg).unwrap_or_else(|e| {
                                    error!("Failed to send MCP status: {:?}", e)
                                });
                                result_messages.push(Message::developer(format!(
                                    "Error calling MCP tool: {}",
                                    err
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
