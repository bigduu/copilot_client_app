use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json;

pub mod file_tools;

#[async_trait]
pub trait Tool: Debug + Send + Sync {
    fn name(&self) -> String;
    fn description(&self) -> String;
    fn parameters(&self) -> Vec<Parameter>;
    fn required_approval(&self) -> bool;
    async fn execute(&self, parameters: Vec<Parameter>) -> anyhow::Result<String>;
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Parameter {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalToolInfo {
    pub name: String,
    pub description: String,
    pub parameters: Vec<Parameter>,
    pub requires_approval: bool,
}

#[derive(Debug, Clone)]
pub struct ToolManager {
    tools: HashMap<String, Arc<dyn Tool>>,
}

impl ToolManager {
    pub fn new(tools: HashMap<String, Arc<dyn Tool>>) -> Self {
        Self { tools }
    }

    pub fn get_tool(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.get(name).cloned()
    }

    pub fn register_tool(&mut self, tool: Arc<dyn Tool>) {
        self.tools.insert(tool.name(), tool);
    }

    pub fn list_tools(&self) -> String {
        match serde_json::to_string(&self.get_local_tools_info()) {
            Ok(json) => json,
            Err(_) => String::from("[]"), // 出错时返回空数组
        }
    }

    pub fn get_local_tools_info(&self) -> Vec<LocalToolInfo> {
        self.tools
            .values()
            .map(|tool| LocalToolInfo {
                name: tool.name(),
                description: tool.description(),
                parameters: tool.parameters(),
                requires_approval: tool.required_approval(),
            })
            .collect()
    }
}

// Function to create a new tool manager with all tools registered
pub fn create_tool_manager() -> ToolManager {
    let mut manager = ToolManager::new(HashMap::new());
    file_tools::register_file_tools(&mut manager);
    manager
}
