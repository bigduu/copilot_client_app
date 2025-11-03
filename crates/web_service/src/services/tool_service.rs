use crate::error::AppError;
use crate::models::{ToolExecutionRequest, ToolExecutionResult};
use std::sync::{Arc, Mutex};
use tool_system::registry::{CategoryRegistry, ToolRegistry};
use tool_system::types::{CategoryInfo, ToolArguments};
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
            executor,
        }
    }

    // Note: get_tools_for_ui and build_tool_ui_info removed
    // Tools are no longer exposed to frontend UI - they are injected into system prompts
    // for LLM-driven autonomous usage

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
            .execute_tool(
                &request.tool_name,
                ToolArguments::Json(serde_json::Value::Object(
                    request
                        .parameters
                        .into_iter()
                        .map(|p| (p.name, p.value.into()))
                        .collect(),
                )),
            )
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
        let tools_map: std::collections::HashMap<
            String,
            std::sync::Arc<dyn tool_system::types::Tool>,
        > = tool_reg
            .list_tool_definitions()
            .into_iter()
            .map(|def| (def.name.clone(), tool_reg.get_tool(&def.name).unwrap()))
            .collect();

        cat_reg
            .list_categories()
            .into_iter()
            .map(|cat| cat.build_info(&tools_map))
            .collect()
    }

    pub fn get_category(&self, category_id: &str) -> Option<CategoryInfo> {
        if let Some(cat) = self
            .category_registry
            .lock()
            .unwrap()
            .get_category(category_id)
        {
            let tool_reg = self.registry.lock().unwrap();
            let tools_map: std::collections::HashMap<
                String,
                std::sync::Arc<dyn tool_system::types::Tool>,
            > = tool_reg
                .list_tool_definitions()
                .into_iter()
                .map(|def| (def.name.clone(), tool_reg.get_tool(&def.name).unwrap()))
                .collect();
            Some(cat.build_info(&tools_map))
        } else {
            None
        }
    }
}
