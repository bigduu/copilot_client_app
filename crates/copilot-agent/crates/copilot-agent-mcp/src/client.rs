use copilot_agent_core::tools::{ToolExecutor, ToolCall, ToolResult, ToolSchema, ToolError};
use async_trait::async_trait;

use crate::tools::{FilesystemTool, CommandTool};

/// MCP 客户端 - 实现真实工具调用
pub struct McpClient;

impl McpClient {
    pub fn new() -> Self {
        Self
    }
    
    /// 获取所有可用的工具 schema
    pub fn get_all_tool_schemas() -> Vec<ToolSchema> {
        let mut schemas = vec![];
        
        // 添加文件系统工具
        for schema_json in FilesystemTool::get_tool_schemas() {
            if let Ok(schema) = serde_json::from_value::<ToolSchema>(schema_json) {
                schemas.push(schema);
            }
        }
        
        // 添加命令工具
        for schema_json in CommandTool::get_tool_schemas() {
            if let Ok(schema) = serde_json::from_value::<ToolSchema>(schema_json) {
                schemas.push(schema);
            }
        }
        
        schemas
    }
}

impl Default for McpClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for McpClient {
    async fn execute(&self, call: &ToolCall) -> std::result::Result<ToolResult, ToolError> {
        // 解析参数
        let args: serde_json::Value = serde_json::from_str(&call.function.arguments)
            .map_err(|e| ToolError::InvalidArguments(format!("Invalid JSON arguments: {}", e)))?;
        
        match call.function.name.as_str() {
            // 文件系统工具
            "read_file" => {
                let path = args["path"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;
                
                match FilesystemTool::read_file(path).await {
                    Ok(content) => Ok(ToolResult {
                        success: true,
                        result: content,
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            "write_file" => {
                let path = args["path"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;
                let content = args["content"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'content' parameter".to_string()))?;
                
                match FilesystemTool::write_file(path, content).await {
                    Ok(_) => Ok(ToolResult {
                        success: true,
                        result: format!("File written successfully: {}", path),
                        display_preference: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            "list_directory" => {
                let path = args["path"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;
                
                match FilesystemTool::list_directory(path).await {
                    Ok(entries) => Ok(ToolResult {
                        success: true,
                        result: entries.join("\n"),
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            "file_exists" => {
                let path = args["path"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;
                
                match FilesystemTool::file_exists(path).await {
                    Ok(exists) => Ok(ToolResult {
                        success: true,
                        result: if exists { "true" } else { "false" }.to_string(),
                        display_preference: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            "get_file_info" => {
                let path = args["path"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'path' parameter".to_string()))?;
                
                match FilesystemTool::get_file_info(path).await {
                    Ok(info) => Ok(ToolResult {
                        success: true,
                        result: info,
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            // 命令工具
            "execute_command" => {
                let command = args["command"].as_str()
                    .ok_or_else(|| ToolError::InvalidArguments("Missing 'command' parameter".to_string()))?;
                
                let args_vec: Vec<String> = args["args"].as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                
                let cwd = args["cwd"].as_str();
                
                match CommandTool::execute(command, args_vec, cwd, 30).await {
                    Ok(result) => Ok(ToolResult {
                        success: result.success,
                        result: result.format_output(),
                        display_preference: Some("markdown".to_string()),
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            "get_current_dir" => {
                match CommandTool::get_current_dir().await {
                    Ok(dir) => Ok(ToolResult {
                        success: true,
                        result: dir,
                        display_preference: None,
                    }),
                    Err(e) => Ok(ToolResult {
                        success: false,
                        result: e,
                        display_preference: None,
                    }),
                }
            }
            
            _ => Err(ToolError::NotFound(format!("Tool '{}' not found", call.function.name))),
        }
    }

    fn list_tools(&self) -> Vec<ToolSchema> {
        Self::get_all_tool_schemas()
    }
}
