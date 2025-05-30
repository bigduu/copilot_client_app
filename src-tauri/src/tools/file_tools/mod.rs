mod append;
mod create;
mod delete;
mod execute_command;
mod read;
mod search;
mod update;

use crate::tools::ToolManager;
use std::sync::Arc;

// 重新导出所有工具结构
pub use append::AppendFileTool;
pub use create::CreateFileTool;
pub use delete::DeleteFileTool;
pub use execute_command::ExecuteCommandTool;
pub use read::ReadFileTool;
pub use search::SearchFilesTool;
pub use update::UpdateFileTool;

// 注册所有文件工具到工具管理器
pub fn register_file_tools(manager: &mut ToolManager) {
    manager.register_tool(Arc::new(CreateFileTool));
    manager.register_tool(Arc::new(DeleteFileTool));
    manager.register_tool(Arc::new(ReadFileTool));
    manager.register_tool(Arc::new(UpdateFileTool));
    manager.register_tool(Arc::new(AppendFileTool));
    manager.register_tool(Arc::new(ExecuteCommandTool));
    manager.register_tool(Arc::new(SearchFilesTool));
}
