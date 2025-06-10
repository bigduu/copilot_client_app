use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::tools::{Parameter, ToolCategory, ToolConfig, ToolManager};

#[derive(Serialize)]
pub struct ParameterInfo {
    pub name: String,
    pub description: String,
    pub required: bool,
    #[serde(rename = "type")]
    pub param_type: String,
}

#[derive(Serialize)]
pub struct ToolUIInfo {
    pub name: String,
    pub description: String,
    pub parameters: Vec<ParameterInfo>,
    pub tool_type: String,
    pub parameter_regex: Option<String>,
    pub ai_response_template: Option<String>,
}

#[derive(Deserialize)]
pub struct ToolExecutionRequest {
    pub tool_name: String,
    pub parameters: Vec<ParameterValue>,
}

#[derive(Deserialize, Debug)]
pub struct ParameterValue {
    pub name: String,
    pub value: String,
}

#[tauri::command]
pub fn get_available_tools(
    tool_manager: State<'_, std::sync::Arc<ToolManager>>,
) -> Result<String, String> {
    let tools_list = tool_manager.list_tools();
    Ok(tools_list)
}

#[tauri::command]
pub fn get_tools_for_ui(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolUIInfo>, String> {
    let tools = tool_manager.list_tools_for_ui();
    Ok(tools)
}

#[tauri::command(async)]
pub async fn execute_tool(
    request: ToolExecutionRequest,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<String, String> {
    // Get the tool
    let tool = tool_manager
        .get_tool(&request.tool_name)
        .ok_or_else(|| format!("Tool '{}' not found", request.tool_name))?;

    // Convert ParameterValue to Parameter
    let parameters: Vec<Parameter> = request
        .parameters
        .into_iter()
        .map(|pv| Parameter {
            name: pv.name,
            value: pv.value,
            description: String::new(), // Not needed for execution
            required: false,            // Not needed for execution
        })
        .collect();

    // Execute the tool
    tool.execute(parameters)
        .await
        .map_err(|e| format!("Tool execution failed: {}", e))
}

// This command is mainly for UI information purposes,
// not for actual tool execution (that's handled by the processor)
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

// ===== 新的工具配置管理 API =====

#[tauri::command]
pub fn get_available_tool_configs(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolConfig>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.get_available_tools())
}

#[tauri::command]
pub fn get_tool_config_by_name(
    tool_name: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Option<ToolConfig>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.get_tool_config(&tool_name).cloned())
}

#[tauri::command]
pub async fn update_tool_config_by_name(
    tool_name: String,
    config: ToolConfig,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<(), String> {
    let config_manager = tool_manager.get_config_manager();
    let mut config_manager = config_manager
        .write()
        .map_err(|e| format!("Failed to write config: {}", e))?;
    config_manager
        .update_tool_config(&tool_name, config)
        .map_err(|e| format!("Failed to update config: {}", e))
}

// ===== 新的 Category 管理 API =====

#[tauri::command]
pub fn get_tool_categories(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolCategory>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.get_categories().clone())
}

#[tauri::command]
pub fn get_category_tools(
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolConfig>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    config_manager.get_category_tools(&category_id)
}

#[tauri::command]
pub async fn update_category_config(
    category_id: String,
    category: ToolCategory,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<(), String> {
    let config_manager = tool_manager.get_config_manager();
    let mut config_manager = config_manager
        .write()
        .map_err(|e| format!("Failed to write config: {}", e))?;
    config_manager
        .update_category_config(&category_id, category)
        .map_err(|e| format!("Failed to update category config: {}", e))
}

#[tauri::command]
pub async fn register_tool_to_category(
    tool_name: String,
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<(), String> {
    let config_manager = tool_manager.get_config_manager();
    let mut config_manager = config_manager
        .write()
        .map_err(|e| format!("Failed to write config: {}", e))?;
    config_manager
        .register_tool_to_category(&tool_name, &category_id)
        .map_err(|e| format!("Failed to register tool to category: {}", e))
}

// ===== 获取工具类别信息的 API =====

#[tauri::command]
pub fn get_tool_category_info(
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Option<ToolCategory>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    // 查找指定的工具类别
    let categories = config_manager.get_categories();
    let category = categories.iter().find(|cat| cat.id == category_id);
    
    Ok(category.cloned())
}

// ===== 向后兼容的 API =====

#[tauri::command]
pub fn get_tool_categories_list(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolCategory>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.get_categories().clone())
}

#[tauri::command]
pub fn get_tools_by_category(
    category: ToolCategory,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolConfig>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.get_tools_by_category(&category.id))
}

#[tauri::command]
pub fn is_tool_enabled_check(
    tool_name: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<bool, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.is_tool_enabled(&tool_name))
}

#[tauri::command]
pub fn tool_requires_approval_check(
    tool_name: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<bool, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.requires_approval(&tool_name))
}

#[tauri::command]
pub fn get_tool_permissions(
    tool_name: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<String>, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    Ok(config_manager.get_tool_permissions(&tool_name))
}

#[tauri::command]
pub async fn reset_tool_configs_to_defaults(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<(), String> {
    let config_manager = tool_manager.get_config_manager();
    let mut config_manager = config_manager
        .write()
        .map_err(|e| format!("Failed to write config: {}", e))?;
    config_manager.reset_to_defaults();
    Ok(())
}

#[tauri::command]
pub fn export_tool_configs(tool_manager: State<'_, Arc<ToolManager>>) -> Result<String, String> {
    let config_manager = tool_manager.get_config_manager();
    let config_manager = config_manager
        .read()
        .map_err(|e| format!("Failed to read config: {}", e))?;
    config_manager
        .export_configs()
        .map_err(|e| format!("Failed to export configs: {}", e))
}

#[tauri::command]
pub async fn import_tool_configs(
    json_content: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<(), String> {
    let config_manager = tool_manager.get_config_manager();
    let mut config_manager = config_manager
        .write()
        .map_err(|e| format!("Failed to write config: {}", e))?;
    config_manager
        .import_configs(&json_content)
        .map_err(|e| format!("Failed to import configs: {}", e))
}
