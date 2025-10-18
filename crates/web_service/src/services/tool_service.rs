use crate::error::AppError;
use crate::models::{
    ParameterInfo, ToolExecutionRequest, ToolExecutionResult, ToolUIInfo, ToolsUIResponse,
};
use std::sync::Arc;
use tool_system::manager::ToolsManager;
use tool_system::types::{Parameter, ToolCategory, ToolConfig};

#[derive(Clone)]
pub struct ToolService {
    tools_manager: Arc<ToolsManager>,
}

impl ToolService {
    pub fn new(tools_manager: Arc<ToolsManager>) -> Self {
        Self { tools_manager }
    }

    pub fn get_available_tools(&self) -> String {
        let tool_names = self.tools_manager.get_tool_names();
        format!("Available tools: {}", tool_names.join(", "))
    }

    pub fn get_tools_for_ui(&self, category_id: Option<String>) -> ToolsUIResponse {
        let (tool_configs, is_strict_mode) = self.get_tool_configs_for_category(category_id);

        let tools = tool_configs
            .into_iter()
            .filter_map(|config| self.build_tool_ui_info(config))
            .collect();

        ToolsUIResponse {
            tools,
            is_strict_mode,
        }
    }

    fn get_tool_configs_for_category(
        &self,
        category_id: Option<String>,
    ) -> (Vec<ToolConfig>, bool) {
        let category_id = match category_id {
            Some(id) => id,
            None => return (self.tools_manager.list_tools_for_ui(), false),
        };

        let category = match self.tools_manager.get_category_by_id(&category_id) {
            Some(cat) => cat,
            None => return (self.tools_manager.list_tools_for_ui(), false),
        };

        if category.strict_tools_mode {
            let category_tools = self.tools_manager.get_category_tools(&category_id);
            let allowed_tool_names: std::collections::HashSet<String> =
                category_tools.iter().map(|tool| tool.name()).collect();
            let all_tools = self.tools_manager.list_tools_for_ui();
            let filtered_configs = all_tools
                .into_iter()
                .filter(|tool| allowed_tool_names.contains(&tool.name))
                .collect();
            (filtered_configs, true)
        } else {
            (self.tools_manager.list_tools_for_ui(), false)
        }
    }

    fn build_tool_ui_info(&self, config: ToolConfig) -> Option<ToolUIInfo> {
        let tool = self.tools_manager.get_tool(&config.name)?;
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

        Some(ToolUIInfo {
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
        })
    }

    pub async fn execute_tool(
        &self,
        request: ToolExecutionRequest,
    ) -> Result<ToolExecutionResult, AppError> {
        let tool = self
            .tools_manager
            .get_tool(&request.tool_name)
            .ok_or_else(|| AppError::ToolNotFound(request.tool_name.clone()))?;

        let display_preference = tool.display_preference();

        let parameters: Vec<Parameter> = request
            .parameters
            .into_iter()
            .map(|pv| Parameter {
                name: pv.name,
                value: pv.value,
                description: String::new(),
                required: false,
            })
            .collect();

        let result = tool
            .execute(parameters)
            .await
            .map_err(|e| AppError::ToolExecutionError(e.to_string()))?;

        let execution_result = ToolExecutionResult {
            result,
            display_preference,
        };

        Ok(execution_result)
    }

    pub fn get_tool_categories(&self) -> Vec<ToolCategory> {
        let category_infos = self.tools_manager.get_all_category_info();
        category_infos
            .into_iter()
            .map(|info| info.category)
            .collect()
    }

    pub fn get_category_tools(&self, category_id: String) -> Vec<ToolConfig> {
        self.tools_manager.get_category_tool_configs(&category_id)
    }

    pub fn get_tool_category_info(&self, category_id: String) -> Option<ToolCategory> {
        self.tools_manager.get_category_by_id(&category_id)
    }

    pub fn get_category_system_prompt(&self, category_id: String) -> Option<String> {
        self.tools_manager
            .get_category_by_id(&category_id)
            .map(|cat| cat.system_prompt)
    }

    pub fn get_tools_documentation(&self) -> String {
        let mut documentation = String::from("Available Tools:\n\n");
        let category_infos = self.tools_manager.get_enabled_category_info();
        for (index, category_info) in category_infos.iter().enumerate() {
            documentation.push_str(&format!(
                "{}. {} ({})\n",
                index + 1,
                category_info.category.display_name,
                category_info.category.description
            ));
            for tool in &category_info.tools {
                documentation.push_str(&format!("   - {}: {}\n", tool.name, tool.description));
            }
            documentation.push('\n');
        }
        documentation.push_str("These tools are available through the chat interface. Simply describe what you want to do, and the AI will use the appropriate tools to help you.");
        documentation
    }
}
