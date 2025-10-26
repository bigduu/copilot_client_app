//! Examples of parameterized tool and category registration
//!
//! This file demonstrates different ways to register tools and categories
//! that require constructor parameters.

use async_trait::async_trait;
use serde_json::json;

use crate::{
    registry::macros::auto_register_tool,
    types::{
        DisplayPreference, Parameter, Tool, ToolArguments, ToolDefinition, ToolError, ToolType,
    },
};

// ============================================================================
// Example 1: Simple tool with no parameters (existing pattern)
// ============================================================================

#[derive(Debug)]
pub struct SimpleTool;

impl SimpleTool {
    pub const TOOL_NAME: &'static str = "simple_tool";

    pub fn new() -> Self {
        Self
    }
}

impl Default for SimpleTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for SimpleTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: "A simple tool with no constructor parameters".to_string(),
            parameters: vec![],
            requires_approval: false,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: DisplayPreference::Default,
        }
    }

    async fn execute(&self, _args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        Ok(json!({"status": "Simple tool executed"}))
    }
}

// Register using the original macro
auto_register_tool!(SimpleTool);

// ============================================================================
// Example 2: Tool with configuration parameters
// ============================================================================

#[derive(Debug)]
pub struct ConfigurableTool {}

impl ConfigurableTool {
    pub const TOOL_NAME: &'static str = "configurable_tool";

    pub fn new() -> Self {
        Self {}
    }
}

impl Default for ConfigurableTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for ConfigurableTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: Self::TOOL_NAME.to_string(),
            description: format!("A configurable tool connecting to {}", "123"),
            parameters: vec![Parameter {
                name: "action".to_string(),
                description: "The action to perform".to_string(),
                required: true,
            }],
            requires_approval: false,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: DisplayPreference::Default,
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        let action = match args {
            ToolArguments::String(action) => action,
            ToolArguments::Json(json) => json
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("default")
                .to_string(),
            _ => "default".to_string(),
        };

        Ok(json!({
            "status": format!(
                "Configurable tool executed action '{}' on {} with timeout {}s",
                action, "www", 10
            )
        }))
    }
}

auto_register_tool!(ConfigurableTool);
