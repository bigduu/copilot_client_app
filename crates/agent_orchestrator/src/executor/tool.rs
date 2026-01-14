//! Tool Executor - Blocking tool execution
//!
//! Handles standard tool calls and MCP tool calls.

use async_trait::async_trait;
use serde_json::Value;
use std::sync::{Arc, Mutex}; // Use std::sync::Mutex to match tool_system

use chat_core::todo::{TodoItem, TodoItemType};
use mcp_client::client::McpClientManager;
use tool_system::executor::ToolExecutor as SystemToolExecutor;
use tool_system::registry::ToolRegistry;
use tool_system::types::ToolArguments;

use super::Executor;

pub struct ToolExecutor {
    // We wrap the system executor
    system_executor: SystemToolExecutor,
    mcp_manager: Arc<McpClientManager>,
}

impl ToolExecutor {
    pub fn new(registry: Arc<Mutex<ToolRegistry>>, mcp_manager: Arc<McpClientManager>) -> Self {
        Self {
            system_executor: SystemToolExecutor::new(registry),
            mcp_manager,
        }
    }
}

#[async_trait]
impl Executor for ToolExecutor {
    fn can_handle(&self, item: &TodoItem) -> bool {
        matches!(
            item.item_type,
            TodoItemType::ToolCall { .. } | TodoItemType::McpTool { .. }
        )
    }

    async fn execute(&self, item: &TodoItem) -> Result<Option<Value>, String> {
        match &item.item_type {
            TodoItemType::ToolCall {
                tool_name,
                arguments,
            } => {
                // Execute using system executor
                // Wrap arguments in ToolArguments::Json
                let tool_args = ToolArguments::Json(arguments.clone());

                self.system_executor
                    .execute_tool(tool_name, tool_args)
                    .await
                    .map(|result| Some(result))
                    .map_err(|e| e.to_string())
            }

            TodoItemType::McpTool {
                server_name,
                tool_name,
                arguments,
            } => {
                // Execute using MCP client
                let client = self
                    .mcp_manager
                    .get(server_name)
                    .ok_or_else(|| format!("MCP server '{}' not found", server_name))?;

                use rmcp::model::CallToolRequestParam;

                // Convert Value to Map for arguments
                let args_map = if let Value::Object(map) = arguments {
                    Some(map.clone())
                } else {
                    Some(serde_json::Map::new())
                };

                let param = CallToolRequestParam {
                    name: tool_name.clone().into(),
                    arguments: args_map,
                };

                client
                    .call_tool(param)
                    .await
                    .map(|res| Some(serde_json::to_value(res).unwrap_or_default()))
                    .map_err(|e| e.to_string())
            }

            _ => Err("Invalid item type for ToolExecutor".to_string()),
        }
    }
}
