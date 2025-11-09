//! Workflow service for managing and executing workflows

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use workflow_system::{WorkflowDefinition, WorkflowExecutor, WorkflowRegistry};

/// Service for managing workflows
pub struct WorkflowService {
    registry: Arc<WorkflowRegistry>,
    executor: Arc<WorkflowExecutor>,
}

impl WorkflowService {
    pub fn new(registry: Arc<WorkflowRegistry>) -> Self {
        let executor = Arc::new(WorkflowExecutor::new(registry.clone()));
        Self { registry, executor }
    }

    /// List all available workflows
    pub fn list_workflows(&self) -> Vec<WorkflowDefinition> {
        self.registry.list_workflow_definitions()
    }

    /// List workflows by category
    pub fn list_workflows_by_category(&self, category: &str) -> Vec<WorkflowDefinition> {
        self.registry.list_workflows_by_category(category)
    }

    /// Get a specific workflow definition by name
    pub fn get_workflow(&self, name: &str) -> Option<WorkflowDefinition> {
        self.registry.get_workflow(name).map(|w| w.definition())
    }

    /// Execute a workflow with the given parameters
    pub async fn execute_workflow(
        &self,
        name: &str,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value> {
        self.executor
            .execute(name, parameters)
            .await
            .map_err(|e| anyhow::anyhow!("Workflow execution failed: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_workflows() {
        let registry = Arc::new(WorkflowRegistry::new());
        let service = WorkflowService::new(registry);

        let workflows = service.list_workflows();
        // Should have at least the example workflows registered
        assert!(workflows.len() >= 2);

        let names: Vec<String> = workflows.iter().map(|w| w.name.clone()).collect();
        assert!(names.contains(&"echo".to_string()));
        assert!(names.contains(&"create_file".to_string()));
    }

    #[tokio::test]
    async fn test_execute_echo_workflow() {
        let registry = Arc::new(WorkflowRegistry::new());
        let service = WorkflowService::new(registry);

        let mut params = HashMap::new();
        params.insert("message".to_string(), serde_json::json!("test message"));

        let result = service.execute_workflow("echo", params).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert_eq!(output["success"], true);
        assert_eq!(output["echo"], "test message");
    }

    #[tokio::test]
    async fn test_execute_nonexistent_workflow() {
        let registry = Arc::new(WorkflowRegistry::new());
        let service = WorkflowService::new(registry);

        let params = HashMap::new();
        let result = service.execute_workflow("nonexistent", params).await;
        assert!(result.is_err());
    }
}






