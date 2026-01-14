//! Executor module - Task execution logic
//!
//! Provides executors for different TodoItem types:
//! - Tools (blocking)
//! - Workflows (blocking)
//! - SubContexts (async)

pub mod tool;
pub mod workflow;
pub mod subcontext;

use async_trait::async_trait;
use serde_json::Value;
use chat_core::todo::TodoItem;

/// Trait for executing a specific type of task
#[async_trait]
pub trait Executor {
    /// Execute the task and return the result
    async fn execute(&self, item: &TodoItem) -> Result<Option<Value>, String>;
    
    /// Check if this executor can handle the given item
    fn can_handle(&self, item: &TodoItem) -> bool;
}
