use tauri::State;

use crate::tools::ToolManager;

#[tauri::command]
pub fn get_available_tools(
    tool_manager: State<'_, std::sync::Arc<ToolManager>>,
) -> Result<String, String> {
    let tools_list = tool_manager.list_tools();
    Ok(tools_list)
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
