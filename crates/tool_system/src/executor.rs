use std::sync::{Arc, Mutex};
use crate::registry::ToolRegistry;
use crate::types::{ToolArguments, ToolError};

#[derive(Debug)]
pub struct ToolExecutor {
    registry: Arc<Mutex<ToolRegistry>>,
}

impl ToolExecutor {
    pub fn new(registry: Arc<Mutex<ToolRegistry>>) -> Self {
        Self { registry }
    }

    pub async fn execute_tool(
        &self,
        tool_name: &str,
        args: ToolArguments,
    ) -> Result<serde_json::Value, ToolError> {
        let tool = self.registry.lock().unwrap().get_tool(tool_name).ok_or_else(|| {
            ToolError::ExecutionFailed(format!("Tool '{}' not found", tool_name))
        })?;

        tool.execute(args).await
    }
}