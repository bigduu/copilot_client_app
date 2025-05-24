use async_trait::async_trait;
use log::{debug, error, info};
use rmcp::model::CallToolRequestParam;
use serde_json::{Map, Value};
use std::borrow::Cow;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::copilot::model::stream_model::Message;
use crate::mcp::client::get_global_manager;

use super::{append_to_system_message, parse_tool_calls_from_content, Processor, ToolCall};

pub struct McpProcessor {
    enabled: bool,
}

impl McpProcessor {
    pub fn new() -> Self {
        Self { enabled: true }
    }

    /// Get MCP tools information for system prompt
    async fn get_mcp_tools_info(&self) -> Result<String, String> {
        let manager = match get_global_manager() {
            Some(manager) => manager,
            None => {
                return Err("MCP client manager not initialized".to_string());
            }
        };

        let tools_result = manager.get_all_clients_tools_list().await;
        match tools_result {
            Ok(tools) => {
                debug!("Available MCP tools: {:?}", tools);
                let tools_list = tools
                    .iter()
                    .map(|tool| {
                        format!(
                            "- {}: {}",
                            tool.name,
                            if tool.description.is_empty() {
                                "No description"
                            } else {
                                &tool.description
                            }
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                Ok(format!(
                    "=== MCP External Tools ===\n{}\n\n使用方式：当需要使用MCP工具时，请在回复中包含JSON格式：\n{{\"use_tool\": true, \"tool_type\": \"mcp\", \"tool_name\": \"工具名\", \"parameters\": {{...}}, \"requires_approval\": true/false}}\n\n安全操作(查询、搜索): requires_approval: false\n危险操作(创建、删除、修改): requires_approval: true",
                    tools_list
                ))
            }
            Err(e) => {
                error!("Failed to list MCP tools: {:?}", e);
                Err(format!("Failed to get MCP tools: {}", e))
            }
        }
    }

    /// Parse MCP tool calls from content
    fn parse_mcp_tool_calls(&self, content: &str) -> Vec<ToolCall> {
        let tool_calls = parse_tool_calls_from_content(content);
        // Filter only MCP tool calls
        tool_calls
            .into_iter()
            .filter(|call| call.tool_type == "mcp")
            .collect()
    }

    /// Execute MCP tool
    async fn execute_mcp_tool(
        &self,
        tool_call: &ToolCall,
        channel: &Channel<String>,
    ) -> Result<String, String> {
        let manager = match get_global_manager() {
            Some(manager) => manager,
            None => {
                return Err("MCP client manager not initialized".to_string());
            }
        };

        // Send execution update
        let exec_update = format!(
            "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": \"Executing MCP tool: '{}' with parameters: {}\"}}", 
            tool_call.tool_name,
            serde_json::to_string(&tool_call.parameters).unwrap_or_else(|_| "{}".to_string())
        );
        let _ = channel.send(exec_update);

        // Convert parameters to Map<String, Value> if it's an object
        let arguments = if let Some(obj) = tool_call.parameters.as_object() {
            obj.clone()
        } else {
            Map::new()
        };

        // Create the tool call request
        let param = CallToolRequestParam {
            name: Cow::Owned(tool_call.tool_name.clone()),
            arguments: Some(arguments.clone()),
        };

        info!(
            "Executing MCP tool: {} with args: {:?}",
            tool_call.tool_name, arguments
        );

        // Call the tool
        match manager
            .get_client_by_tools(&tool_call.tool_name)
            .ok_or_else(|| format!("No MCP client found for tool: {}", tool_call.tool_name))?
            .call_tool(param)
            .await
        {
            Ok(result) => {
                debug!("MCP tool call result: {:?}", result);

                let response_content = if result.is_error.unwrap_or(false) {
                    format!(
                        "Error from MCP tool {}: {:?}",
                        tool_call.tool_name, result.content
                    )
                } else {
                    format!(
                        "MCP tool {} result:\n```json\n{:?}\n```",
                        tool_call.tool_name, result.content
                    )
                };

                // Send success update
                let success_update = format!(
                    "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": \"MCP tool '{}' execution successful\"}}", 
                    tool_call.tool_name
                );
                let _ = channel.send(success_update);

                Ok(response_content)
            }
            Err(err) => {
                error!("Error calling MCP tool: {:?}", err);

                // Send failure update
                let failure_update = format!(
                    "{{\"type\": \"processor_update\", \"source\": \"mcp\", \"content\": \"MCP tool '{}' execution failed: {}\"}}", 
                    tool_call.tool_name,
                    err
                );
                let _ = channel.send(failure_update);

                Err(format!(
                    "Error calling MCP tool {}: {}",
                    tool_call.tool_name, err
                ))
            }
        }
    }

    /// Send approval request to frontend
    async fn send_approval_request(
        &self,
        tool_call: &ToolCall,
        channel: &Channel<String>,
    ) -> Result<(), String> {
        let approval_request = serde_json::json!({
            "type": "approval_request",
            "source": "mcp",
            "tool_call": tool_call,
            "message": format!("Do you want to execute MCP tool '{}'?", tool_call.tool_name)
        });

        channel
            .send(approval_request.to_string())
            .map_err(|e| format!("Failed to send approval request: {:?}", e))?;

        Ok(())
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

    async fn enhance_system_prompt(&self, messages: &mut Vec<Message>) -> Result<(), String> {
        // Get MCP tools information
        let tools_info = self.get_mcp_tools_info().await?;

        // Append to system message
        append_to_system_message(messages, &tools_info);

        // Send processor update
        debug!("Enhanced system prompt with MCP tools information");

        Ok(())
    }

    async fn extract_and_execute_tools(
        &self,
        content: &str,
        channel: &Channel<String>,
    ) -> Result<Option<String>, String> {
        // Parse MCP tool calls from content
        let mcp_tool_calls = self.parse_mcp_tool_calls(content);

        if mcp_tool_calls.is_empty() {
            return Ok(None);
        }

        // For now, handle the first tool call found
        // TODO: Handle multiple tool calls
        let tool_call = &mcp_tool_calls[0];

        info!("Found MCP tool call: {:?}", tool_call);

        if tool_call.requires_approval {
            // Send approval request to frontend
            self.send_approval_request(tool_call, channel).await?;
            Ok(Some(
                "🔄 Waiting for user approval for MCP tool execution...".to_string(),
            ))
        } else {
            // Execute tool directly
            let result = self.execute_mcp_tool(tool_call, channel).await?;
            Ok(Some(result))
        }
    }

    /// Legacy method - still needed for backward compatibility but will use new approach
    async fn process(&self, messages: Vec<Message>, channel: &Channel<String>) -> Vec<Message> {
        // For backward compatibility, just return messages unchanged
        // The new flow will use enhance_system_prompt and extract_and_execute_tools
        messages
    }
}
