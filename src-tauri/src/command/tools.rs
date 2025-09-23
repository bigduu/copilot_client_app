use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use tool_system::manager::ToolsManager;
use tool_system::types::{DisplayPreference, Parameter, ToolCategory, ToolConfig};

#[derive(Serialize, Deserialize, Debug)]
pub struct ApprovalConfig {
    #[serde(rename = "autoApprovedTools")]
    pub auto_approved_tools: Vec<String>,
}

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
    pub parameter_parsing_strategy: String,
    pub parameter_regex: Option<String>,
    pub ai_prompt_template: Option<String>, // Renamed for clarity
    pub hide_in_selector: bool,
    pub display_preference: DisplayPreference,
    pub required_approval: bool,
}

#[derive(Serialize)]
pub struct ToolsUIResponse {
    pub tools: Vec<ToolUIInfo>,
    pub is_strict_mode: bool,
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
) -> Result<ToolsUIResponse, String> {
    let mut is_strict_mode = false;
    let tool_configs: Vec<ToolConfig>;

    if let Some(category_id) = category_id {
        if let Some(category) = tool_manager.get_category_by_id(&category_id) {
            if category.strict_tools_mode {
                is_strict_mode = true;
                let category_tools = tool_manager.get_category_tools(&category_id);
                let allowed_tool_names: std::collections::HashSet<String> =
                    category_tools.iter().map(|tool| tool.name()).collect();
                let all_tools = tool_manager.list_tools_for_ui();
                tool_configs = all_tools
                    .into_iter()
                    .filter(|tool| allowed_tool_names.contains(&tool.name))
                    .collect();
            } else {
                tool_configs = tool_manager.list_tools_for_ui();
            }
        } else {
            tool_configs = tool_manager.list_tools_for_ui();
        }
    } else {
        tool_configs = tool_manager.list_tools_for_ui();
    }

    let tools: Vec<ToolUIInfo> = tool_configs
        .into_iter()
        .map(|config| {
            let tool = tool_manager.get_tool(&config.name).unwrap();
            let parameters = tool
                .parameters()
                .into_iter()
                .map(|p| ParameterInfo {
                    name: p.name,
                    description: p.description,
                    required: p.required,
                    param_type: "string".to_string(),
                })
                .collect();
            ToolUIInfo {
                name: config.name,
                description: config.description,
                parameters,
                tool_type: config.tool_type,
                parameter_parsing_strategy: "".to_string(),
                parameter_regex: config.parameter_regex,
                ai_prompt_template: None,
                hide_in_selector: config.hide_in_selector,
                display_preference: tool.display_preference(),
                required_approval: tool.required_approval(),
            }
        })
        .collect();

    Ok(ToolsUIResponse {
        tools,
        is_strict_mode,
    })
}

#[derive(Serialize)]
struct ToolExecutionResult {
    result: String,
    display_preference: DisplayPreference,
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

    // Get display preference from the tool instance
    let display_preference = tool.display_preference();

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
    let result = tool
        .execute(parameters)
        .await
        .map_err(|e| format!("Tool execution failed: {}", e))?;

    // Create a structured result
    let execution_result = ToolExecutionResult {
        result,
        display_preference,
    };

    // Serialize the structured result to a JSON string and return
    serde_json::to_string(&execution_result)
        .map_err(|e| format!("Failed to serialize tool result: {}", e))
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
