use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::extension_system::{Parameter, ToolCategory, ToolConfig, ToolsManager};

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
    tool_manager: State<'_, std::sync::Arc<ToolsManager>>,
) -> Result<String, String> {
    let tool_names = tool_manager.get_tool_names();
    Ok(format!("Available tools: {}", tool_names.join(", ")))
}

#[tauri::command]
pub fn get_tools_for_ui(
    tool_manager: State<'_, Arc<ToolsManager>>,
    category_id: Option<String>,
) -> Result<Vec<ToolUIInfo>, String> {
    // 如果指定了类别ID，检查是否为严格模式
    if let Some(category_id) = category_id {
        if let Some(category) = tool_manager.get_category_by_id(&category_id) {
            if category.strict_tools_mode {
                // 严格模式：只返回该类别允许的工具
                let category_tools = tool_manager.get_category_tools(&category_id);

                let allowed_tool_names: std::collections::HashSet<String> =
                    category_tools.iter().map(|tool| tool.name()).collect();

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
    tool_manager: State<'_, Arc<ToolsManager>>,
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
pub fn get_tools_documentation(
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<String, String> {
    let mut documentation = String::from("Available Tools:\n\n");

    // Get all categories and their tools
    let category_infos = tool_manager.get_enabled_category_info();

    for (index, category_info) in category_infos.iter().enumerate() {
        // Add category header
        documentation.push_str(&format!(
            "{}. {} ({})\n",
            index + 1,
            category_info.category.display_name,
            category_info.category.description
        ));

        // Add tools in this category
        for tool in &category_info.tools {
            documentation.push_str(&format!("   - {}: {}\n", tool.name, tool.description));
        }

        documentation.push('\n');
    }

    documentation.push_str("These tools are available through the chat interface. Simply describe what you want to do, and the AI will use the appropriate tools to help you.");

    Ok(documentation)
}

// ===== Core Category Management API =====

/// Get all available tool categories (sorted by priority)
#[tauri::command]
pub fn get_tool_categories(
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<Vec<ToolCategory>, String> {
    let category_infos = tool_manager.get_all_category_info();
    let categories = category_infos
        .into_iter()
        .map(|info| info.category)
        .collect();
    Ok(categories)
}

/// Get tools for a specific category
#[tauri::command]
pub fn get_category_tools(
    category_id: String,
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<Vec<ToolConfig>, String> {
    let tools = tool_manager.get_category_tool_configs(&category_id);
    Ok(tools)
}

/// Get category information by ID
#[tauri::command]
pub fn get_tool_category_info(
    category_id: String,
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<Option<ToolCategory>, String> {
    let category = tool_manager.get_category_by_id(&category_id);
    Ok(category)
}

// ===== Utility API Functions =====

/// Get tool manager statistics
#[tauri::command]
pub fn get_tool_manager_stats(
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<serde_json::Value, String> {
    let stats = serde_json::json!({
        "total_categories": tool_manager.category_count(),
        "enabled_categories": tool_manager.enabled_category_count(),
        "total_tools": tool_manager.tool_count(),
    });
    Ok(stats)
}

/// Check if a category is enabled
#[tauri::command]
pub fn is_category_enabled(
    category_id: String,
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<bool, String> {
    let category = tool_manager.get_category_by_id(&category_id);
    Ok(category.is_some_and(|cat| cat.enabled))
}

/// Get category system prompt
#[tauri::command]
pub fn get_category_system_prompt(
    category_id: String,
    tool_manager: State<'_, Arc<ToolsManager>>,
) -> Result<Option<String>, String> {
    let category = tool_manager.get_category_by_id(&category_id);
    Ok(category.map(|cat| cat.system_prompt))
}
