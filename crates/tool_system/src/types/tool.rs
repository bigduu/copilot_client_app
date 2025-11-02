//! Tool-related type definitions

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt::Debug;
use thiserror::Error;

use super::{Parameter, ToolType, ToolArguments};

/// Permission types required for tool execution.
/// These should match the Permission enum in context_manager.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ToolPermission {
    ReadFiles,
    WriteFiles,
    CreateFiles,
    DeleteFiles,
    ExecuteCommands,
}

/// Defines how the tool's output should be displayed in the UI.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub enum DisplayPreference {
    /// The output is displayed directly.
    #[default]
    Default,
    /// The output is rendered inside a collapsible container.
    Collapsible,
    /// The output is hidden from the user.
    Hidden,
}

#[derive(Error, Debug)]
pub enum ToolError {
    #[error("Invalid arguments provided to tool: {0}")]
    InvalidArguments(String),
    #[error("Tool execution failed: {0}")]
    ExecutionFailed(String),
    #[error(transparent)]
    InternalError(#[from] anyhow::Error),
}


/// The static definition of a tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Vec<Parameter>,
    #[serde(default = "default_requires_approval")]
    pub requires_approval: bool,
    pub tool_type: ToolType,
    pub parameter_regex: Option<String>,
    pub custom_prompt: Option<String>,
    #[serde(default = "default_hide_in_selector")]
    pub hide_in_selector: bool,
    #[serde(default)]
    pub display_preference: DisplayPreference,
    
    /// Documentation for how the LLM should use the terminate flag with this tool.
    /// When the LLM calls this tool, it must include a "terminate" field in the JSON:
    /// - terminate: true = This is the final action, return results to the user
    /// - terminate: false = Continue the agent loop after this tool execution
    /// 
    /// This field provides guidance on typical usage patterns for the terminate flag.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub termination_behavior_doc: Option<String>,
    
    /// Permissions required to use this tool.
    /// Tools with only ReadFiles permission can be used in Planner role.
    /// Tools requiring other permissions need Actor role or higher.
    #[serde(default)]
    pub required_permissions: Vec<ToolPermission>,
}

fn default_requires_approval() -> bool {
    true
}

fn default_hide_in_selector() -> bool {
    true
}


/// Tool trait definition
#[async_trait]
pub trait Tool: Debug + Send + Sync {
    /// Returns the tool's static definition.
    fn definition(&self) -> ToolDefinition;

    /// Executes the tool with the given arguments.
    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError>;
}

// The ToolConfig struct is now deprecated in favor of the ToolDefinition.
// It will be removed in a future refactoring.
// For now, we keep it for compatibility with the web service layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfig {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub category_id: String,
    pub enabled: bool,
    pub requires_approval: bool,
    pub auto_prefix: Option<String>,
    pub permissions: Vec<String>,
    pub tool_type: String,
    pub parameter_regex: Option<String>,
    pub custom_prompt: Option<String>,
    pub hide_in_selector: bool,
    #[serde(default)]
    pub display_preference: DisplayPreference,
}
