use crate::error::AppError;
use crate::models::{
    ParameterInfo, ToolExecutionRequest, ToolExecutionResult, ToolUIInfo, ToolsUIResponse,
};
use log::debug;
use std::sync::{Arc, Mutex};
use tool_system::registry::{CategoryRegistry, ToolRegistry};
use tool_system::types::{ToolArguments, ToolDefinition, CategoryInfo};
use tool_system::ToolExecutor;

#[derive(Clone)]
pub struct ToolService {
    registry: Arc<Mutex<ToolRegistry>>,
    category_registry: Arc<Mutex<CategoryRegistry>>,
    executor: Arc<ToolExecutor>,
}

impl ToolService {
    pub fn new(registry: Arc<Mutex<ToolRegistry>>, executor: Arc<ToolExecutor>) -> Self {
        Self { 
            registry, 
            category_registry: Arc::new(Mutex::new(CategoryRegistry::new())),
            executor 
        }
    }

    pub fn get_tools_for_ui(&self, _category_id: Option<String>) -> ToolsUIResponse {
        let tool_defs = self.registry.lock().unwrap().list_tool_definitions();
        debug!(
            "get_tools_for_ui: Found {} tool configs",
            tool_defs.len(),
        );

        let tools = tool_defs
            .into_iter()
            .map(|def| self.build_tool_ui_info(def))
            .collect();

        let response = ToolsUIResponse {
            tools,
            is_strict_mode: false, // This needs to be re-evaluated with the new category system
        };

        debug!("get_tools_for_ui: Responding with: {:?}", response);
        response
    }

    fn build_tool_ui_info(&self, def: ToolDefinition) -> ToolUIInfo {
        let parameters = def
            .parameters
            .into_iter()
            .map(|p| ParameterInfo {
                name: p.name,
                description: p.description,
                required: p.required,
                param_type: "string".to_string(),
            })
            .collect();

        ToolUIInfo {
            name: def.name,
            description: def.description,
            parameters,
            tool_type: format!("{:?}", def.tool_type),
            parameter_parsing_strategy: "".to_string(),
            parameter_regex: def.parameter_regex,
            ai_prompt_template: def.custom_prompt,
            hide_in_selector: def.hide_in_selector,
            display_preference: def.display_preference,
            required_approval: def.requires_approval,
        }
    }

    pub async fn execute_tool(
        &self,
        request: ToolExecutionRequest,
    ) -> Result<ToolExecutionResult, AppError> {
        let tool_def = self
            .registry
            .lock()
            .unwrap()
            .get_tool(&request.tool_name)
            .map(|t| t.definition())
            .ok_or_else(|| AppError::ToolNotFound(request.tool_name.clone()))?;

        let display_preference = tool_def.display_preference;

        let result = self
            .executor
            .execute_tool(&request.tool_name, ToolArguments::Json(serde_json::Value::Object(request.parameters.into_iter().map(|p| (p.name, p.value.into())).collect())))
            .await
            .map_err(|e| AppError::ToolExecutionError(e.to_string()))?;

        let execution_result = ToolExecutionResult {
            result: result.to_string(),
            display_preference,
        };

        Ok(execution_result)
    }

    pub fn get_categories(&self) -> Vec<CategoryInfo> {
        let cat_reg = self.category_registry.lock().unwrap();
        let tool_reg = self.registry.lock().unwrap();
        let tools_map: std::collections::HashMap<String, std::sync::Arc<dyn tool_system::types::Tool>> = 
            tool_reg.list_tool_definitions()
                .into_iter()
                .map(|def| (def.name.clone(), tool_reg.get_tool(&def.name).unwrap()))
                .collect();

        cat_reg.list_categories()
            .into_iter()
            .map(|cat| cat.build_info(&tools_map))
            .collect()
    }

    pub fn get_category(&self, category_id: &str) -> Option<CategoryInfo> {
        if let Some(cat) = self.category_registry.lock().unwrap().get_category(category_id) {
            let tool_reg = self.registry.lock().unwrap();
            let tools_map: std::collections::HashMap<String, std::sync::Arc<dyn tool_system::types::Tool>> = 
                tool_reg.list_tool_definitions()
                    .into_iter()
                    .map(|def| (def.name.clone(), tool_reg.get_tool(&def.name).unwrap()))
                    .collect();
            Some(cat.build_info(&tools_map))
        } else {
            None
        }
    }
}
