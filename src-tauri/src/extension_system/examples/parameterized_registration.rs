//! Examples of parameterized tool and category registration
//!
//! This file demonstrates different ways to register tools and categories
//! that require constructor parameters.

use anyhow::Result;
use async_trait::async_trait;
use similar::DiffableStr;
use std::sync::Arc;

use crate::extension_system::{
    auto_register_category, auto_register_tool, Category, CategoryId, CategoryMetadata, Parameter,
    Tool, ToolType,
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

#[async_trait]
impl Tool for SimpleTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        "A simple tool with no constructor parameters".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn hide_in_selector(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, _parameters: Vec<Parameter>) -> Result<String> {
        Ok("Simple tool executed".to_string())
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

#[async_trait]
impl Tool for ConfigurableTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn description(&self) -> String {
        format!("A configurable tool connecting to {}", "123")
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![Parameter {
            name: "action".to_string(),
            description: "The action to perform".to_string(),
            required: true,
            value: "".to_string(),
        }]
    }

    fn required_approval(&self) -> bool {
        false
    }

    fn hide_in_selector(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        ToolType::AIParameterParsing
    }

    async fn execute(&self, parameters: Vec<Parameter>) -> Result<String> {
        let action: &str = parameters
            .iter()
            .find(|p| p.name == "action")
            .map(|p| &p.value)
            .map_or("default", |v| v);

        Ok(format!(
            "Configurable tool executed action '{}' on {} with timeout {}s",
            action, "www", 10
        ))
    }
}

auto_register_tool!(ConfigurableTool);
