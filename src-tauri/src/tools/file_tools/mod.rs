mod append;
mod create;
mod delete;
mod execute_command;
mod read;
mod search;
mod simple_search;
mod update;

use crate::tools::ToolManager;
use std::sync::Arc;

// Re-export all tool structures
pub use append::AppendFileTool;
pub use create::CreateFileTool;
pub use delete::DeleteFileTool;
pub use execute_command::ExecuteCommandTool;
pub use read::ReadFileTool;
pub use search::SearchFilesTool;
pub use simple_search::SimpleSearchTool;
pub use update::UpdateFileTool;

// Register all file tools to the tool manager
pub fn register_file_tools(manager: &mut ToolManager) {
    manager.register_tool(Arc::new(CreateFileTool));
    manager.register_tool(Arc::new(DeleteFileTool));
    manager.register_tool(Arc::new(ReadFileTool));
    manager.register_tool(Arc::new(UpdateFileTool));
    manager.register_tool(Arc::new(AppendFileTool));
    manager.register_tool(Arc::new(ExecuteCommandTool));
    manager.register_tool(Arc::new(SearchFilesTool));
    manager.register_tool(Arc::new(SimpleSearchTool));
}
