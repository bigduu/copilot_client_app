//! Tool-related type definitions

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

use super::{Parameter, ToolType};

/// Tool trait definition
#[async_trait]
pub trait Tool: Debug + Send + Sync {
    fn name(&self) -> String;
    fn description(&self) -> String;
    fn parameters(&self) -> Vec<Parameter>;
    fn required_approval(&self) -> bool;
    fn tool_type(&self) -> ToolType;

    /// For RegexParameterExtraction type tools, return parameter extraction regex
    fn parameter_regex(&self) -> Option<String> {
        None
    }

    /// Return tool-specific custom prompt content, appended after standard format
    /// Used to provide tool-specific format requirements or processing guidance
    fn custom_prompt(&self) -> Option<String> {
        None
    }

    /// Whether this tool should be hidden from the tool selector UI
    /// Hidden tools can only be called by AI, not directly by users through the selector
    fn hide_in_selector(&self) -> bool {
        true
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> anyhow::Result<String>;
}

/// Tool configuration structure
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
}

impl ToolConfig {
    /// Set category ID
    pub fn with_category_id(mut self, category_id: String) -> Self {
        self.category_id = category_id;
        self
    }

    /// Set enabled status
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set display name
    pub fn with_display_name(mut self, display_name: String) -> Self {
        self.display_name = display_name;
        self
    }

    /// Set description
    pub fn with_description(mut self, description: String) -> Self {
        self.description = description;
        self
    }
}
