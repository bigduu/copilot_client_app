//! Workflow executor implementation

use std::collections::HashMap;
use std::sync::Arc;

use crate::registry::WorkflowRegistry;
use crate::types::{Workflow, WorkflowError};

/// Executes workflows by name
#[derive(Debug)]
pub struct WorkflowExecutor {
    registry: Arc<WorkflowRegistry>,
}

impl WorkflowExecutor {
    /// Create a new workflow executor with the given registry
    pub fn new(registry: Arc<WorkflowRegistry>) -> Self {
        Self { registry }
    }

    /// Execute a workflow by name with the given parameters
    pub async fn execute(
        &self,
        name: &str,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        let workflow = self
            .registry
            .get_workflow(name)
            .ok_or_else(|| WorkflowError::NotFound(name.to_string()))?;

        // Validate parameters
        self.validate_parameters(&workflow, &parameters)?;

        // Execute the workflow
        workflow.execute(parameters).await
    }

    /// Validate that required parameters are present
    fn validate_parameters(
        &self,
        workflow: &Arc<dyn Workflow>,
        parameters: &HashMap<String, serde_json::Value>,
    ) -> Result<(), WorkflowError> {
        let definition = workflow.definition();

        for param in &definition.parameters {
            if param.required && !parameters.contains_key(&param.name) {
                return Err(WorkflowError::InvalidParameters(format!(
                    "Missing required parameter: {}",
                    param.name
                )));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Parameter, WorkflowDefinition};
    use async_trait::async_trait;

    #[derive(Debug)]
    struct TestWorkflow;

    #[async_trait]
    impl Workflow for TestWorkflow {
        fn definition(&self) -> WorkflowDefinition {
            WorkflowDefinition {
                name: "test".to_string(),
                description: "Test workflow".to_string(),
                parameters: vec![Parameter {
                    name: "required_param".to_string(),
                    description: "A required parameter".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                }],
                category: "test".to_string(),
                requires_approval: false,
                custom_prompt: None,
            }
        }

        async fn execute(
            &self,
            _parameters: HashMap<String, serde_json::Value>,
        ) -> Result<serde_json::Value, WorkflowError> {
            Ok(serde_json::json!({"status": "success"}))
        }
    }

    #[tokio::test]
    async fn test_validate_parameters_missing_required() {
        let registry = Arc::new(WorkflowRegistry::default());
        let executor = WorkflowExecutor::new(registry);
        let workflow = Arc::new(TestWorkflow) as Arc<dyn Workflow>;
        let params = HashMap::new();

        let result = executor.validate_parameters(&workflow, &params);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("required_param"));
    }

    #[tokio::test]
    async fn test_validate_parameters_success() {
        let registry = Arc::new(WorkflowRegistry::default());
        let executor = WorkflowExecutor::new(registry);
        let workflow = Arc::new(TestWorkflow) as Arc<dyn Workflow>;
        let mut params = HashMap::new();
        params.insert("required_param".to_string(), serde_json::json!("value"));

        let result = executor.validate_parameters(&workflow, &params);
        assert!(result.is_ok());
    }
}







