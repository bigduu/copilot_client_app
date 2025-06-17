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
    category_id: Option<String>,
) -> Result<Vec<ToolUIInfo>, String> {
    // 如果指定了类别ID，检查是否为严格模式
    if let Some(category_id) = category_id {
        if let Some(category) = tool_manager.get_category_by_id(&category_id) {
            if category.strict_tools_mode {
                // 严格模式：只返回该类别允许的工具
                let category_tools = tool_manager.get_category_tools(&category_id);

                let allowed_tool_names: std::collections::HashSet<String> = category_tools
                    .iter()
                    .map(|tool| tool.name.clone())
                    .collect();

                let all_tools = tool_manager.list_tools_for_ui();

                let filtered_tools: Vec<ToolUIInfo> = all_tools
                    .into_iter()
                    .filter(|tool| allowed_tool_names.contains(&tool.name))
                    .collect();

                return Ok(filtered_tools);
            }
        }
    }

    // 非严格模式或未指定类别：返回所有工具
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
    // 使用新架构获取所有类别信息（包括按优先级排序）
    let category_infos = tool_manager.get_all_category_info();
    let categories = category_infos
        .into_iter()
        .map(|info| info.category)
        .collect();
    Ok(categories)
}

#[tauri::command]
pub fn get_category_tools(
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolConfig>, String> {
    // 使用新架构直接获取类别工具
    let tools = tool_manager.get_category_tools(&category_id);
    Ok(tools)
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
    // 使用新架构根据ID获取类别信息
    let category = tool_manager.get_category_by_id(&category_id);
    Ok(category)
}

// ===== 向后兼容的 API =====

#[tauri::command]
pub fn get_tool_categories_list(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolCategory>, String> {
    // 使用新架构直接获取启用的类别，包含 system_prompt 字段
    let categories = tool_manager.get_enabled_categories();
    Ok(categories)
}

#[tauri::command]
pub fn get_tools_by_category(
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolConfig>, String> {
    // 使用新架构直接获取指定类别的工具配置
    let tools = tool_manager.get_category_tools(&category_id);
    Ok(tools)
}

#[tauri::command]
pub fn is_tool_enabled_check(
    tool_name: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<bool, String> {
    // 使用新架构检查工具是否可用（即存在且启用）
    Ok(tool_manager.is_tool_available(&tool_name))
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

// ===== 新架构优化的 API =====

/// 获取启用类别的详细信息，包含 system_prompt 和优先级排序
#[tauri::command]
pub fn get_enabled_categories_with_priority(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Vec<ToolCategory>, String> {
    // 获取启用的类别，已按优先级排序
    let categories = tool_manager.get_enabled_categories();
    Ok(categories)
}

/// 获取工具管理器统计信息
#[tauri::command]
pub fn get_tool_manager_stats(
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<serde_json::Value, String> {
    let stats = serde_json::json!({
        "total_categories": tool_manager.category_count(),
        "enabled_categories": tool_manager.enabled_category_count(),
        "total_tools": tool_manager.tool_count(),
    });
    Ok(stats)
}

/// 检查类别是否启用
#[tauri::command]
pub fn is_category_enabled(
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<bool, String> {
    let category = tool_manager.get_category_by_id(&category_id);
    Ok(category.is_some_and(|cat| cat.enabled))
}

/// 获取类别的 system_prompt
#[tauri::command]
pub fn get_category_system_prompt(
    category_id: String,
    tool_manager: State<'_, Arc<ToolManager>>,
) -> Result<Option<String>, String> {
    let category = tool_manager.get_category_by_id(&category_id);
    Ok(category.map(|cat| cat.system_prompt))
}
