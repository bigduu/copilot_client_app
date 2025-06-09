use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use crate::tools::{Parameter, ToolManager};

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
