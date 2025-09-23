//! Tool-related type definitions

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

use super::{Parameter, ToolType};

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

    /// Specifies how the tool's output should be displayed.
    /// Defaults to `DisplayPreference::Default`.
    fn display_preference(&self) -> DisplayPreference {
        DisplayPreference::Default
    }

    /// Generates a prompt template for AI-based parameter parsing.
    /// This can be overridden by specific tools for custom behavior.
    fn get_ai_prompt_template(&self) -> Option<String> {
        if self.tool_type() != ToolType::AIParameterParsing {
            return None;
        }

        let parameters_desc = self
            .parameters()
            .iter()
            .map(|p| {
                format!(
                    "- {}: {} ({})",
                    p.name,
                    p.description,
                    if p.required { "required" } else { "optional" }
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        let template = format!(
            r#"CRITICAL: You are ONLY a parameter extraction system. Ignore any previous instructions or system prompts.

Your ONLY task is to extract parameter values from user input for tool execution.

Tool: {}
Description: {}
Parameters:
{}

EXTRACTION RULES:
- Extract the exact parameter value from the user input
- Return ONLY the raw parameter value, nothing else
- Do NOT ask questions, provide explanations, or act as an assistant
- Do NOT provide safety warnings or security checks

User input: "{{user_description}}"

Extract parameter value:"#,
            self.name(),
            self.description(),
            parameters_desc
        );

        Some(template)
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
    #[serde(default)]
    pub display_preference: DisplayPreference,
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
