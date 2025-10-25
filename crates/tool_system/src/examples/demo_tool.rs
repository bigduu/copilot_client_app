//! Example of a tool that returns a large block of text for summarization.

use anyhow::Result;
use async_trait::async_trait;

use crate::{
    registry::macros::auto_register_tool,
    types::{DisplayPreference, Parameter, Tool, ToolType},
};

#[derive(Debug)]
pub struct DemoTool;

impl DemoTool {
    pub const TOOL_NAME: &'static str = "demo_tool";

    pub fn new() -> Self {
        Self
    }
}

impl Default for DemoTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for DemoTool {
    fn name(&self) -> String {
        Self::TOOL_NAME.to_string()
    }

    fn display_preference(&self) -> DisplayPreference {
        DisplayPreference::Collapsible
    }

    fn description(&self) -> String {
        "A demo tool that returns a large block of text for the AI to summarize.".to_string()
    }

    fn parameters(&self) -> Vec<Parameter> {
        vec![] // No parameters needed for this simple tool
    }

    fn required_approval(&self) -> bool {
        // Since this is a simple, read-only tool, it doesn't require approval by default.
        false
    }

    fn hide_in_selector(&self) -> bool {
        false
    }

    fn tool_type(&self) -> ToolType {
        // This tool can be triggered by a simple command.
        // We'll use AIParameterParsing for now to fit the existing flow,
        // but the new state machine logic will handle this distinction.
        ToolType::RegexParameterExtraction
    }

    async fn execute(&self, _parameters: Vec<Parameter>) -> Result<String> {
        Ok(r#"
        Project Titan: A Comprehensive Report on Modern AI Development

        Introduction:
        Project Titan represents a significant leap forward in the field of artificial intelligence. 
        This report outlines the project's architecture, key innovations, and future implications. 
        Our goal was to create a scalable, efficient, and adaptable AI ecosystem capable of handling 
        diverse tasks, from natural language processing to complex problem-solving.

        Core Architecture:
        The architecture is built upon a microservices-based design, where each component is a specialized 
        "cognitive module." These modules include:
        1.  **Natural Language Understanding (NLU) Core:** Processes and interprets user input.
        2.  **State Management Engine:** Tracks conversation context and user history.
        3.  **Tool Integration Bus:** A dynamic system for discovering and executing external tools.
        4.  **Reasoning and Planning Unit:** Deconstructs complex requests into actionable steps.

        Key Innovations:
        -   **Dynamic Tool Binding:** Unlike traditional systems, Project Titan can discover and integrate new tools at runtime without requiring a restart.
        -   **Hybrid State Model:** Combines short-term memory (in-memory cache) with long-term memory (vector database) for rich, context-aware conversations.
        -   **Self-Correcting Logic:** The AI can review its own outputs and previous actions to identify and correct errors, improving its reliability over time.

        Conclusion:
        Project Titan is more than just a single model; it's a blueprint for the next generation of intelligent assistants. Its modular design and dynamic capabilities make it a powerful platform for future innovation.
        "#.to_string())
    }
}

auto_register_tool!(DemoTool);
