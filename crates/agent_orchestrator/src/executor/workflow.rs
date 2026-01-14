//! Workflow Executor - Blocking workflow execution
//!
//! Handles workflow steps.

use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
// Mutex not needed as workflow_system uses internal synchronization
// use tokio::sync::Mutex;

use chat_core::todo::{TodoItem, TodoItemType};
use workflow_system::executor::WorkflowExecutor as SystemWorkflowExecutor;
use workflow_system::registry::WorkflowRegistry;

use super::Executor;

pub struct WorkflowExecutor {
    system_executor: SystemWorkflowExecutor,
}

impl WorkflowExecutor {
    pub fn new(registry: Arc<WorkflowRegistry>) -> Self {
        Self {
            system_executor: SystemWorkflowExecutor::new(registry),
        }
    }
}

#[async_trait]
impl Executor for WorkflowExecutor {
    fn can_handle(&self, item: &TodoItem) -> bool {
        matches!(item.item_type, TodoItemType::WorkflowStep { .. })
    }

    async fn execute(&self, item: &TodoItem) -> Result<Option<Value>, String> {
        match &item.item_type {
            TodoItemType::WorkflowStep { workflow_name, .. } => {
                // Currently ignoring step_index as workflow engine executes the whole workflow
                // Ideally this should be improved in the future to support resumed execution

                // workflow_system executor expects empty map if no params,
                // but TodoItemType::WorkflowStep doesn't currently store parameters!
                // Assuming empty parameters for now or we need to update TodoItemType
                let parameters = std::collections::HashMap::new();

                // Execute workflow
                self.system_executor
                    .execute(workflow_name, parameters)
                    .await
                    .map(|result| Some(result))
                    .map_err(|e| e.to_string())
            }

            _ => Err("Invalid item type for WorkflowExecutor".to_string()),
        }
    }
}
