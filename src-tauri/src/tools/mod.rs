use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::{Arc, RwLock};

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
    enabled_tools: Arc<RwLock<HashMap<String, bool>>>,
}

impl ToolManager {
    pub fn new(tools: HashMap<String, Arc<dyn Tool>>) -> Self {
        let mut enabled_tools = HashMap::new();
        // 默认所有工具都启用
        for tool_name in tools.keys() {
            enabled_tools.insert(tool_name.clone(), true);
        }
        Self {
            tools,
            enabled_tools: Arc::new(RwLock::new(enabled_tools)),
        }
    }

    pub fn get_tool(&self, name: &str) -> Option<Arc<dyn Tool>> {
        // 只返回已启用的工具
        if self.is_tool_enabled(name) {
            self.tools.get(name).cloned()
        } else {
            None
        }
    }

    pub fn register_tool(&mut self, tool: Arc<dyn Tool>) {
        let tool_name = tool.name();
        self.tools.insert(tool_name.clone(), tool);
        // 默认新注册的工具是启用的
        if let Ok(mut enabled_tools) = self.enabled_tools.write() {
            enabled_tools.insert(tool_name, true);
        }
    }

    pub fn is_tool_enabled(&self, name: &str) -> bool {
        if let Ok(enabled_tools) = self.enabled_tools.read() {
            enabled_tools.get(name).copied().unwrap_or(false)
        } else {
            false
        }
    }

    pub fn set_tool_enabled(&self, name: &str, enabled: bool) -> anyhow::Result<()> {
        if !self.tools.contains_key(name) {
            return Err(anyhow::anyhow!("Tool '{}' not found", name));
        }

        if let Ok(mut enabled_tools) = self.enabled_tools.write() {
            enabled_tools.insert(name.to_string(), enabled);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Failed to update tool status"))
        }
    }

    pub fn get_all_tools_info(&self) -> Vec<ToolInfo> {
        let mut tools_info = Vec::new();
        for tool in self.tools.values() {
            let enabled = self.is_tool_enabled(&tool.name());
            tools_info.push(ToolInfo {
                name: tool.name(),
                description: tool.description(),
                enabled,
                required_approval: tool.required_approval(),
            });
        }
        tools_info.sort_by(|a, b| a.name.cmp(&b.name));
        tools_info
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
