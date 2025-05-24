use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use tauri::State;

use crate::mcp::client::get_global_manager;
use crate::tools::{LocalToolInfo, Parameter, ToolManager};
use rmcp::model::CallToolRequestParam;

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolExecutionError {
    pub error_type: String, // "validation_error" | "execution_error" | "not_found"
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ToolInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub tool_type: String, // "local" | "mcp"
    pub description: String,
    pub parameters: Vec<Parameter>,
    pub requires_approval: bool,
}

#[derive(Debug, Deserialize)]
pub struct ToolCall {
    pub tool_type: String, // "local" | "mcp"
    pub tool_name: String,
    pub parameters: serde_json::Value,
}

// 获取所有可用工具的统一API（JSON格式）
#[tauri::command]
pub async fn get_all_available_tools(
    tool_manager: State<'_, std::sync::Arc<ToolManager>>,
) -> Result<Vec<ToolInfo>, String> {
    let mut tools = Vec::new();

    // Local tools - now using JSON format directly
    for local_tool in tool_manager.get_local_tools_info() {
        tools.push(ToolInfo {
            name: local_tool.name,
            tool_type: "local".to_string(),
            description: local_tool.description,
            parameters: local_tool.parameters,
            requires_approval: local_tool.requires_approval,
        });
    }

    // MCP tools
    if let Some(manager) = get_global_manager() {
        match manager.get_all_clients_tools_list().await {
            Ok(mcp_tools) => {
                for tool in mcp_tools {
                    tools.push(ToolInfo {
                        name: tool.name.to_string(),
                        tool_type: "mcp".to_string(),
                        description: tool.description.to_string(),
                        parameters: Vec::new(), // MCP tools don't have detailed parameters in current implementation
                        requires_approval: determine_mcp_tool_approval(&tool.name),
                    });
                }
            }
            Err(e) => return Err(format!("Failed to get MCP tools: {}", e)),
        }
    }

    Ok(tools)
}

// 执行本地工具
#[tauri::command]
pub async fn execute_local_tool(
    tool_name: String,
    parameters: Vec<Parameter>,
    tool_manager: State<'_, std::sync::Arc<ToolManager>>,
) -> Result<String, ToolExecutionError> {
    match tool_manager.get_tool(&tool_name) {
        Some(tool) => match tool.execute(parameters).await {
            Ok(result) => Ok(result),
            Err(e) => Err(ToolExecutionError {
                error_type: "execution_error".to_string(),
                message: e.to_string(),
                details: None,
            }),
        },
        None => Err(ToolExecutionError {
            error_type: "not_found".to_string(),
            message: format!("Tool '{}' not found", tool_name),
            details: None,
        }),
    }
}

// 执行MCP工具
#[tauri::command]
pub async fn execute_mcp_tool(
    tool_name: String,
    parameters: Vec<Parameter>,
) -> Result<String, ToolExecutionError> {
    // 转换Parameter -> serde_json::Value
    let mut param_map = serde_json::Map::new();
    for param in parameters {
        param_map.insert(param.name, serde_json::Value::String(param.value));
    }

    if let Some(manager) = get_global_manager() {
        if let Some(client) = manager.get_client_by_tools(&tool_name) {
            let param = CallToolRequestParam {
                name: Cow::Owned(tool_name.clone()),
                arguments: Some(param_map),
            };

            match client.call_tool(param).await {
                Ok(result) => {
                    if result.is_error.unwrap_or(false) {
                        Err(ToolExecutionError {
                            error_type: "execution_error".to_string(),
                            message: format!("MCP tool execution failed: {:?}", result.content),
                            details: None,
                        })
                    } else {
                        Ok(format!("{:?}", result.content))
                    }
                }
                Err(e) => Err(ToolExecutionError {
                    error_type: "execution_error".to_string(),
                    message: e.to_string(),
                    details: None,
                }),
            }
        } else {
            Err(ToolExecutionError {
                error_type: "not_found".to_string(),
                message: format!("MCP tool '{}' not found", tool_name),
                details: None,
            })
        }
    } else {
        Err(ToolExecutionError {
            error_type: "execution_error".to_string(),
            message: "MCP manager not initialized".to_string(),
            details: None,
        })
    }
}

// 批量执行工具
#[tauri::command]
pub async fn execute_tools_batch(
    tool_calls: Vec<ToolCall>,
    tool_manager: State<'_, std::sync::Arc<ToolManager>>,
) -> Result<Vec<(String, Result<String, ToolExecutionError>)>, String> {
    let mut results = Vec::new();

    for tool_call in tool_calls {
        let parameters = convert_json_to_parameters(&tool_call.parameters);

        let result = match tool_call.tool_type.as_str() {
            "local" => {
                execute_local_tool(
                    tool_call.tool_name.clone(),
                    parameters,
                    tool_manager.clone(),
                )
                .await
            }
            "mcp" => execute_mcp_tool(tool_call.tool_name.clone(), parameters).await,
            _ => Err(ToolExecutionError {
                error_type: "validation_error".to_string(),
                message: format!("Unknown tool type: {}", tool_call.tool_type),
                details: None,
            }),
        };

        results.push((tool_call.tool_name, result));
    }

    Ok(results)
}

// 保留原有的API以兼容现有代码
#[tauri::command]
pub fn get_available_tools(
    tool_manager: State<'_, std::sync::Arc<ToolManager>>,
) -> Result<Vec<ToolInfo>, String> {
    let mut tools = Vec::new();

    for local_tool in tool_manager.get_local_tools_info() {
        tools.push(ToolInfo {
            name: local_tool.name,
            tool_type: "local".to_string(),
            description: local_tool.description,
            parameters: local_tool.parameters,
            requires_approval: local_tool.requires_approval,
        });
    }

    Ok(tools)
}

#[tauri::command]
pub fn get_tools_documentation() -> Result<String, String> {
    Ok(r#"
    This application provides access to the following file operation tools:

    1. create_file: Creates a new file with specified content
    2. delete_file: Deletes a file at the specified path
    3. read_file: Reads the content of a file (with partial reading capabilities)
    4. update_file: Updates a file using a diff-style approach (replace old content with new)
    5. append_file: Appends content to the end of a file
    6. execute_command: Executes a shell command and returns the output
    7. search_files: Searches for files matching patterns and/or containing specific text

    These tools are available through the chat interface. Simply describe what you want to do
    with files, and the AI will use the appropriate tools to help you.
    "#
    .to_string())
}

// 辅助函数：判断MCP工具是否需要approval
fn determine_mcp_tool_approval(tool_name: &str) -> bool {
    // 可以根据工具名称判断，这里先设置为默认需要approval
    // 后续可以根据具体的MCP工具进行细化
    match tool_name {
        name if name.contains("read") || name.contains("list") || name.contains("get") => false,
        _ => true,
    }
}

// 辅助函数：将JSON参数转换为Parameter格式
fn convert_json_to_parameters(json_params: &serde_json::Value) -> Vec<Parameter> {
    let mut parameters = Vec::new();

    if let Some(obj) = json_params.as_object() {
        for (key, value) in obj {
            parameters.push(Parameter {
                name: key.clone(),
                description: String::new(), // 不需要description用于执行
                required: true,             // 不需要required用于执行
                value: value.as_str().unwrap_or(&value.to_string()).to_string(),
            });
        }
    }

    parameters
}
