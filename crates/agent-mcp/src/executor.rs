use agent_core::tools::{ToolCall, ToolError, ToolExecutor, ToolResult, ToolSchema};
use async_trait::async_trait;
use serde_json::json;
use std::sync::Arc;
use tracing::{debug, error, warn};

use crate::error::McpError;
use crate::manager::McpServerManager;
use crate::tool_index::ToolIndex;
use crate::types::McpContentItem;

/// MCP tool executor that delegates to the MCP server manager
pub struct McpToolExecutor {
    manager: Arc<McpServerManager>,
    index: Arc<ToolIndex>,
}

impl McpToolExecutor {
    pub fn new(manager: Arc<McpServerManager>, index: Arc<ToolIndex>) -> Self {
        Self { manager, index }
    }

    /// Convert MCP result to string representation
    fn format_result_content(content: &[ McpContentItem]) -> String {
        content
            .iter()
            .map(|item| match item {
                McpContentItem::Text { text } => text.clone(),
                McpContentItem::Image { data, mime_type } => {
                    format!("[Image: {} ({} bytes)]", mime_type, data.len())
                }
                McpContentItem::Resource { resource } => {
                    if let Some(text) = &resource.text {
                        format!("[Resource {}]: {}", resource.uri, text)
                    } else {
                        format!("[Resource {}]", resource.uri)
                    }
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[async_trait]
impl ToolExecutor for McpToolExecutor {
    async fn execute(&self,
        call: &ToolCall,
    ) -> std::result::Result<ToolResult, ToolError> {
        let tool_name = &call.function.name;

        // Lookup the tool alias
        let alias = match self.index.lookup(tool_name) {
            Some(alias) => alias,
            None => {
                return Err(ToolError::NotFound(format!(
                    "MCP tool '{}' not found",
                    tool_name
                )));
            }
        };

        debug!(
            "Executing MCP tool: {} (server: {}, original: {})",
            tool_name, alias.server_id, alias.original_name
        );

        // Parse arguments
        let args: serde_json::Value =
            serde_json::from_str(&call.function.arguments).map_err(|e| {
                ToolError::InvalidArguments(format!("Invalid JSON: {}", e))
            })?;

        // Execute via manager
        match self
            .manager
            .call_tool(&alias.server_id, &alias.original_name, args)
            .await
        {
            Ok(result) => {
                if result.is_error {
                    let error_text = Self::format_result_content(&result.content);
                    Ok(ToolResult {
                        success: false,
                        result: error_text,
                        display_preference: None,
                    })
                } else {
                    let content = Self::format_result_content(&result.content);
                    Ok(ToolResult {
                        success: true,
                        result: content,
                        display_preference: None,
                    })
                }
            }
            Err(McpError::ServerNotFound(id)) => {
                Err(ToolError::NotFound(format!("MCP server '{}' not found", id)))
            }
            Err(McpError::ToolNotFound(name)) => {
                Err(ToolError::NotFound(format!("Tool '{}' not found", name)))
            }
            Err(e) => {
                error!("MCP tool execution failed: {}", e);
                Err(ToolError::Execution(format!("MCP error: {}", e)))
            }
        }
    }

    fn list_tools(&self) -> Vec<ToolSchema> {
        self.index
            .all_aliases()
            .into_iter()
            .filter_map(|alias| {
                // Get tool info from manager
                self.manager
                    .get_tool_info(&alias.server_id, &alias.original_name)
                    .map(|tool| ToolSchema {
                        schema_type: "function".to_string(),
                        function: agent_core::tools::FunctionSchema {
                            name: alias.alias,
                            description: tool.description,
                            parameters: tool.parameters,
                        },
                    })
            })
            .collect()
    }
}

/// Composite tool executor that tries built-in tools first, then MCP
pub struct CompositeToolExecutor {
    builtin: Arc<dyn ToolExecutor>,
    mcp: Arc<dyn ToolExecutor>,
}

impl CompositeToolExecutor {
    pub fn new(
        builtin: Arc<dyn ToolExecutor>,
        mcp: Arc<dyn ToolExecutor>,
    ) -> Self {
        Self { builtin, mcp }
    }
}

#[async_trait]
impl ToolExecutor for CompositeToolExecutor {
    async fn execute(&self,
        call: &ToolCall,
    ) -> std::result::Result<ToolResult, ToolError> {
        // Try built-in first
        match self.builtin.execute(call).await {
            Ok(result) => return Ok(result),
            Err(ToolError::NotFound(_)) => {
                // Fall through to MCP
            }
            Err(e) => return Err(e),
        }

        // Try MCP
        self.mcp.execute(call).await
    }

    fn list_tools(&self) -> Vec<ToolSchema> {
        let mut tools = self.builtin.list_tools();
        tools.extend(self.mcp.list_tools());
        tools
    }
}
