use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::Arc;

use async_trait::async_trait;

pub mod file_tools;

#[async_trait]
pub trait Tool: Debug + Send + Sync {
    fn name(&self) -> String;
    fn description(&self) -> String;
    fn parameters(&self) -> Vec<Parameter>;
    fn required_approval(&self) -> bool;
    async fn execute(&self, parameters: Vec<Parameter>) -> anyhow::Result<String>;
}

#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub value: String,
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
        let mut prompt = String::new();
        for tool in self.tools.values() {
            let parameters = tool.parameters();
            let mut parameters_prompt = String::new();
            for parameter in parameters {
                parameters_prompt.push_str(&format!(
                    r#"
                        <{}>
                        <parameter_description>
                        {}
                        </parameter_description>
                        </{}>
                    "#,
                    parameter.name, parameter.description, parameter.name
                ));
            }

            prompt.push_str(&format!(
                r#"
                    <tool>
                    <tool_name>
                    {}
                    </tool_name>
                    <tool_description>
                    {}
                    </tool_description>
                    <tool_parameters>
                    {}
                    </tool_parameters>
                    <tool_required_approval>
                    {}
                    </tool_required_approval>
                    </tool>
                "#,
                tool.name(),
                tool.description(),
                parameters_prompt,
                tool.required_approval()
            ));
        }
        prompt
    }
}

// Function to create a new tool manager with all tools registered
pub fn create_tool_manager() -> ToolManager {
    let mut manager = ToolManager::new(HashMap::new());
    file_tools::register_file_tools(&mut manager);
    manager
}
