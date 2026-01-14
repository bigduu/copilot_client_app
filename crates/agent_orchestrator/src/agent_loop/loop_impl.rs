//! AgentLoop Implementation
//!
//! The unified loop that runs the agent process.

use std::sync::Arc;
use thiserror::Error;

use chat_state::{ChatEvent, ContextState, StateMachine};
// use context_manager::ChatContext; // Context Manager will be refactored, so this is a placeholder dependency

use crate::executor::{tool::ToolExecutor, workflow::WorkflowExecutor, Executor};
use crate::todo_manager::TodoManager;

#[derive(Error, Debug)]
pub enum LoopError {
    #[error("Fatal error: {0}")]
    Fatal(String),
}

pub struct AgentLoop {
    // These will be properly typed when we integrate with context_manager
    state_machine: StateMachine,
    todo_manager: TodoManager,

    // Executors
    tool_executor: Arc<ToolExecutor>,
    workflow_executor: Arc<WorkflowExecutor>,
}

impl AgentLoop {
    pub fn new(
        state_machine: StateMachine,
        tool_executor: Arc<ToolExecutor>,
        workflow_executor: Arc<WorkflowExecutor>,
    ) -> Self {
        Self {
            state_machine,
            todo_manager: TodoManager::new(),
            tool_executor,
            workflow_executor,
        }
    }

    /// Primary entry point: Step the loop once
    /// Returns true if the loop should continue, false if it should pause/stop
    pub async fn step(&mut self) -> Result<bool, LoopError> {
        let current_state = self.state_machine.state().clone();

        match current_state {
            ContextState::Idle => {
                // Nothing to do
                Ok(false)
            }

            ContextState::ExecutingTodoList { todo_list_id, .. } => {
                // Check for pending items
                if let Some(item) = self
                    .todo_manager
                    .get_list(todo_list_id)
                    .and_then(|l| l.next_pending())
                {
                    let item_id = item.id.clone();
                    let is_blocking = item.is_blocking();

                    // Transition to executing item
                    self.state_machine.handle_event(ChatEvent::TodoItemStarted {
                        todo_item_id: item_id,
                        is_blocking,
                    });

                    Ok(true) // Continue immediately
                } else {
                    // List complete!
                    self.state_machine
                        .handle_event(ChatEvent::TodoListCompleted { todo_list_id });
                    Ok(true)
                }
            }

            ContextState::ExecutingTodoItem {
                todo_item_id,
                is_blocking,
            } => {
                // If blocking, we execute it right here
                if is_blocking {
                    self.execute_blocking_item(todo_item_id).await?;
                    Ok(true)
                } else {
                    // If async/streaming (like Chat or SubContext), handling is done elsewhere
                    // (e.g. by setting up a stream or spawning a task)
                    // For now, we just assume it's handled and return false (wait for event)
                    Ok(false)
                }
            }

            _ => {
                // Other states managed by external events or not implemented yet
                Ok(false)
            }
        }
    }

    async fn execute_blocking_item(&mut self, item_id: uuid::Uuid) -> Result<(), LoopError> {
        // Clone item data to release borrow on todo_manager
        let (list_id, item) = {
            let active_list = self
                .todo_manager
                .active_list()
                .ok_or_else(|| LoopError::Fatal("No active list".into()))?;
            let item = active_list
                .get_item(item_id)
                .ok_or_else(|| LoopError::Fatal("Item not found".into()))?;
            (active_list.id, item.clone())
        };

        // Mark started
        let _ = self.todo_manager.mark_item_started(list_id, item_id);

        // Select executor
        let result = if self.tool_executor.can_handle(&item) {
            self.tool_executor.execute(&item).await
        } else if self.workflow_executor.can_handle(&item) {
            self.workflow_executor.execute(&item).await
        } else {
            Err("No executor for item".to_string())
        };

        // Handle result
        match result {
            Ok(val) => {
                let _ = self
                    .todo_manager
                    .mark_item_completed(list_id, item_id, val);
                self.state_machine
                    .handle_event(ChatEvent::TodoItemCompleted {
                        todo_item_id: item_id,
                    });
            }
            Err(e) => {
                let _ = self
                    .todo_manager
                    .mark_item_failed(list_id, item_id, e.clone());
                self.state_machine.handle_event(ChatEvent::TodoItemFailed {
                    todo_item_id: item_id,
                    error: e,
                });
            }
        }

        Ok(())
    }
}
