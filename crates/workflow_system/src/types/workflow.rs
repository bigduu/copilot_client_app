//! Workflow-related type definitions

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::Debug;
use thiserror::Error;

use super::Parameter;

/// Workflow execution errors
#[derive(Error, Debug)]
pub enum WorkflowError {
    #[error("Workflow not found: {0}")]
    NotFound(String),
    
    #[error("Invalid parameters provided to workflow: {0}")]
    InvalidParameters(String),
    
    #[error("Workflow execution failed: {0}")]
    ExecutionFailed(String),
    
    #[error(transparent)]
    InternalError(#[from] anyhow::Error),
}

/// The static definition of a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDefinition {
    /// Unique name of the workflow
    pub name: String,
    
    /// Human-readable description of what the workflow does
    pub description: String,
    
    /// Parameters that the workflow accepts
    pub parameters: Vec<Parameter>,
    
    /// Category ID for UI organization
    pub category: String,
    
    /// Whether this workflow requires user approval before execution
    #[serde(default = "default_requires_approval")]
    pub requires_approval: bool,
    
    /// Custom prompt or instructions for the workflow
    pub custom_prompt: Option<String>,
}

fn default_requires_approval() -> bool {
    false
}

/// Workflow trait definition
#[async_trait]
pub trait Workflow: Debug + Send + Sync {
    /// Returns the workflow's static definition
    fn definition(&self) -> WorkflowDefinition;
    
    /// Executes the workflow with the given parameters
    async fn execute(&self, parameters: HashMap<String, serde_json::Value>) -> Result<serde_json::Value, WorkflowError>;
}


