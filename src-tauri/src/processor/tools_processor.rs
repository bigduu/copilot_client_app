use async_trait::async_trait;
use log::{debug, error, info};
use serde_json::Value;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::copilot::model::stream_model::Message;
use crate::tools::{Parameter, ToolManager};

use super::{append_to_system_message, parse_tool_calls_from_content, Processor, ToolCall};

pub struct ToolsProcessor {
    enabled: bool,
    tool_manager: Arc<ToolManager>,
}

impl ToolsProcessor {
    pub fn new(tool_manager: Arc<ToolManager>) -> Self {
        Self {
            enabled: true,
            tool_manager,
        }
    }

    /// Get local tools information for system prompt
    fn get_local_tools_info(&self) -> String {
        let tools_info = self.tool_manager.list_tools();
        format!(
            "=== Local Tools ===\n{}\n\n使用方式：当需要使用本地工具时，请在回复中包含JSON格式：\n{{\"use_tool\": true, \"tool_type\": \"local\", \"tool_name\": \"工具名\", \"parameters\": {{\"param_name\": \"value\"}}, \"requires_approval\": true/false}}\n\n安全操作(文件读取、搜索): requires_approval: false\n危险操作(文件写入、删除、命令执行): requires_approval: true",
            tools_info
        )
    }

    /// Parse local tool calls from content
    fn parse_local_tool_calls(&self, content: &str) -> Vec<ToolCall> {
        let tool_calls = parse_tool_calls_from_content(content);
        // Filter only local tool calls
        tool_calls
            .into_iter()
            .filter(|call| call.tool_type == "local")
            .collect()
    }

    /// Convert ToolCall parameters to Parameter format for tool execution
    fn convert_tool_call_to_parameters(&self, tool_call: &ToolCall) -> Vec<Parameter> {
        let mut parameters = Vec::new();

        if let Some(obj) = tool_call.parameters.as_object() {
            for (key, value) in obj {
                parameters.push(Parameter {
                    name: key.clone(),
                    description: String::new(), // Not needed for execution
                    required: true,             // Not needed for execution
                    value: value.as_str().unwrap_or(&value.to_string()).to_string(),
                });
            }
        }

        parameters
    }

    /// Execute local tool
    async fn execute_local_tool(
        &self,
        tool_call: &ToolCall,
        channel: &Channel<String>,
    ) -> Result<String, String> {
        // Send execution update
        let exec_update = format!(
            "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": \"Executing local tool: '{}' with parameters: {}\"}}", 
            tool_call.tool_name,
            serde_json::to_string(&tool_call.parameters).unwrap_or_else(|_| "{}".to_string())
        );
        let _ = channel.send(exec_update);

        // Convert parameters
        let parameters = self.convert_tool_call_to_parameters(tool_call);

        info!(
            "Executing local tool: {} with parameters: {:?}",
            tool_call.tool_name, parameters
        );

        // Get the tool by name
        let tool = self
            .tool_manager
            .get_tool(&tool_call.tool_name)
            .ok_or_else(|| format!("Tool not found: {}", tool_call.tool_name))?;

        // Execute the tool
        match tool.execute(parameters).await {
            Ok(result) => {
                debug!("Local tool execution result: {}", result);

                let response_content = format!(
                    "Local tool {} result:\n```\n{}\n```",
                    tool_call.tool_name, result
                );

                // Send success update
                let success_update = format!(
                    "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": \"Local tool '{}' execution successful\"}}", 
                    tool_call.tool_name
                );
                let _ = channel.send(success_update);

                Ok(response_content)
            }
            Err(err) => {
                error!("Error executing local tool: {:?}", err);

                // Send failure update
                let failure_update = format!(
                    "{{\"type\": \"processor_update\", \"source\": \"tools\", \"content\": \"Local tool '{}' execution failed: {}\"}}", 
                    tool_call.tool_name,
                    err
                );
                let _ = channel.send(failure_update);

                Err(format!(
                    "Error executing local tool {}: {}",
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
            "source": "tools",
            "tool_call": tool_call,
            "message": format!("Do you want to execute local tool '{}'?", tool_call.tool_name)
        });

        channel
            .send(approval_request.to_string())
            .map_err(|e| format!("Failed to send approval request: {:?}", e))?;

        Ok(())
    }

    /// Determine if a tool requires approval based on its name
    fn tool_requires_approval(&self, tool_name: &str) -> bool {
        // Define which tools are considered dangerous and require approval
        match tool_name {
            "create_file" | "update_file" | "delete_file" | "append_file" | "execute_command" => {
                true
            }
            "read_file" | "search_files" => false,
            _ => true, // Default to requiring approval for unknown tools
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

    async fn enhance_system_prompt(&self, messages: &mut Vec<Message>) -> Result<(), String> {
        // Get local tools information
        let tools_info = self.get_local_tools_info();

        // Append to system message
        append_to_system_message(messages, &tools_info);

        // Send processor update
        debug!("Enhanced system prompt with local tools information");

        Ok(())
    }

    async fn extract_and_execute_tools(
        &self,
        content: &str,
        channel: &Channel<String>,
    ) -> Result<Option<String>, String> {
        // Parse local tool calls from content
        let local_tool_calls = self.parse_local_tool_calls(content);

        if local_tool_calls.is_empty() {
            return Ok(None);
        }

        // For now, handle the first tool call found
        // TODO: Handle multiple tool calls
        let mut tool_call = local_tool_calls[0].clone();

        // Override requires_approval based on tool safety if not explicitly set
        if tool_call.tool_type == "local" {
            tool_call.requires_approval = self.tool_requires_approval(&tool_call.tool_name);
        }

        info!("Found local tool call: {:?}", tool_call);

        if tool_call.requires_approval {
            // Send approval request to frontend
            self.send_approval_request(&tool_call, channel).await?;
            Ok(Some(
                "🔄 Waiting for user approval for local tool execution...".to_string(),
            ))
        } else {
            // Execute tool directly
            let result = self.execute_local_tool(&tool_call, channel).await?;
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
