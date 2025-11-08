//! Tool Enhancement Processor
//!
//! This processor injects available tool definitions into the system prompt.

use crate::pipeline::context::{ProcessingContext, PromptFragment, ToolDefinition};
use crate::pipeline::error::ProcessError;
use crate::pipeline::result::ProcessResult;
use crate::pipeline::traits::MessageProcessor;

/// Tool Enhancement Processor
///
/// Injects tool definitions into the system prompt based on:
/// - Current agent mode (Plan/Act)
/// - Tool availability
/// - Tool categories
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::processors::ToolEnhancementProcessor;
/// use context_manager::pipeline::MessagePipeline;
///
/// let processor = ToolEnhancementProcessor::new();
/// let pipeline = MessagePipeline::new()
///     .register(Box::new(processor));
/// ```
pub struct ToolEnhancementProcessor {
    config: ToolEnhancementConfig,
}

/// Tool Enhancement Configuration
#[derive(Debug, Clone)]
pub struct ToolEnhancementConfig {
    /// Include tool descriptions in prompt
    pub include_descriptions: bool,

    /// Include parameter schemas
    pub include_parameters: bool,

    /// Group tools by category
    pub group_by_category: bool,

    /// Maximum tools to include (0 = no limit)
    pub max_tools: usize,
}

impl Default for ToolEnhancementConfig {
    fn default() -> Self {
        Self {
            include_descriptions: true,
            include_parameters: true,
            group_by_category: true,
            max_tools: 0,
        }
    }
}

impl ToolEnhancementProcessor {
    /// Create a new tool enhancement processor
    pub fn new() -> Self {
        Self {
            config: ToolEnhancementConfig::default(),
        }
    }

    /// Create with custom configuration
    pub fn with_config(config: ToolEnhancementConfig) -> Self {
        Self { config }
    }

    /// Generate tool definitions prompt
    fn generate_tools_prompt(&self, tools: &[ToolDefinition]) -> String {
        if tools.is_empty() {
            return String::new();
        }

        let mut prompt = String::from("\n## Available Tools\n\n");
        prompt.push_str("You have access to the following tools:\n\n");

        if self.config.group_by_category {
            // Group by category
            let mut by_category: std::collections::HashMap<String, Vec<&ToolDefinition>> =
                std::collections::HashMap::new();

            for tool in tools {
                by_category
                    .entry(tool.category.clone())
                    .or_default()
                    .push(tool);
            }

            for (category, category_tools) in by_category.iter() {
                prompt.push_str(&format!("### {} Tools\n\n", category));

                for tool in category_tools {
                    self.format_tool(&mut prompt, tool);
                }
            }
        } else {
            // Simple list
            for tool in tools {
                self.format_tool(&mut prompt, tool);
            }
        }

        prompt.push_str("\nUse these tools when needed to accomplish the user's request.\n");

        prompt
    }

    /// Format a single tool definition
    fn format_tool(&self, prompt: &mut String, tool: &ToolDefinition) {
        prompt.push_str(&format!("#### `{}`\n\n", tool.name));

        if self.config.include_descriptions {
            prompt.push_str(&format!("{}\n\n", tool.description));
        }

        if self.config.include_parameters && !tool.parameters_schema.is_null() {
            prompt.push_str("**Parameters:**\n");
            if let Some(obj) = tool.parameters_schema.as_object() {
                if let Some(props) = obj.get("properties").and_then(|p| p.as_object()) {
                    for (param_name, param_schema) in props {
                        let param_type = param_schema
                            .get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("any");
                        let required = obj
                            .get("required")
                            .and_then(|r| r.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .any(|v| v.as_str() == Some(param_name.as_str()))
                            })
                            .unwrap_or(false);

                        let required_str = if required { " (required)" } else { "" };
                        prompt.push_str(&format!("- `{}` ({}){}",  param_name, param_type, required_str));

                        if let Some(desc) = param_schema.get("description").and_then(|d| d.as_str())
                        {
                            prompt.push_str(&format!(": {}", desc));
                        }
                        prompt.push('\n');
                    }
                }
            }
            prompt.push('\n');
        }

        if tool.requires_approval {
            prompt.push_str("⚠️ *This tool requires user approval before execution*\n\n");
        }
    }

    /// Get available tools (mock implementation - should integrate with tool_system)
    fn get_available_tools(&self, _ctx: &ProcessingContext) -> Vec<ToolDefinition> {
        // TODO: Integrate with actual tool registry
        // For now, return mock tools for demonstration

        vec![
            ToolDefinition {
                name: "read_file".to_string(),
                description: "Read content from a file in the workspace".to_string(),
                category: "File System".to_string(),
                parameters_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the file relative to workspace root"
                        },
                        "line_range": {
                            "type": "string",
                            "description": "Optional line range (e.g., '10-20')"
                        }
                    },
                    "required": ["path"]
                }),
                requires_approval: false,
            },
            ToolDefinition {
                name: "write_file".to_string(),
                description: "Write content to a file in the workspace".to_string(),
                category: "File System".to_string(),
                parameters_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to the file"
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write"
                        }
                    },
                    "required": ["path", "content"]
                }),
                requires_approval: true,
            },
            ToolDefinition {
                name: "codebase_search".to_string(),
                description: "Search for code in the workspace using semantic search".to_string(),
                category: "Code Analysis".to_string(),
                parameters_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query"
                        },
                        "file_pattern": {
                            "type": "string",
                            "description": "Optional file pattern to filter results"
                        }
                    },
                    "required": ["query"]
                }),
                requires_approval: false,
            },
        ]
    }
}

impl Default for ToolEnhancementProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl MessageProcessor for ToolEnhancementProcessor {
    fn name(&self) -> &str {
        "tool_enhancement"
    }

    fn process<'a>(&self, ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError> {
        // Get available tools
        let tools = self.get_available_tools(ctx);

        // Limit tools if configured
        let tools_to_include = if self.config.max_tools > 0 && tools.len() > self.config.max_tools
        {
            &tools[..self.config.max_tools]
        } else {
            &tools
        };

        // Add tools to context
        for tool in tools_to_include {
            ctx.add_tool(tool.clone());
        }

        // Generate tools prompt
        let tools_prompt = self.generate_tools_prompt(tools_to_include);

        if !tools_prompt.is_empty() {
            // Add prompt fragment
            let fragment = PromptFragment {
                content: tools_prompt,
                source: "tool_enhancement".to_string(),
                priority: 60, // Medium-high priority
            };
            ctx.add_prompt_fragment(fragment);
        }

        Ok(ProcessResult::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structs::context::ChatContext;
    use crate::structs::message::{InternalMessage, Role};
    use crate::structs::message_types::{RichMessageType, TextMessage};
    use uuid::Uuid;

    fn create_test_context() -> ChatContext {
        ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "test-mode".to_string())
    }

    fn create_test_message() -> InternalMessage {
        InternalMessage {
            role: Role::User,
            content: Vec::new(),
            tool_calls: None,
            tool_result: None,
            metadata: None,
            message_type: Default::default(),
            rich_type: Some(RichMessageType::Text(TextMessage::new("Test message"))),
        }
    }

    #[test]
    fn test_tool_enhancement() {
        let processor = ToolEnhancementProcessor::new();
        let message = create_test_message();
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());

        // Should have tools injected
        assert!(!ctx.available_tools.is_empty());

        // Should have prompt fragment
        assert!(!ctx.prompt_fragments.is_empty());
    }

    #[test]
    fn test_generate_tools_prompt() {
        let processor = ToolEnhancementProcessor::new();
        let mut context = create_test_context();
        let tools = processor.get_available_tools(&ProcessingContext::new(create_test_message(), &mut context));

        let prompt = processor.generate_tools_prompt(&tools);

        assert!(prompt.contains("Available Tools"));
        assert!(prompt.contains("read_file"));
        assert!(prompt.contains("write_file"));
        assert!(prompt.contains("codebase_search"));
    }

    #[test]
    fn test_max_tools_limit() {
        let config = ToolEnhancementConfig {
            max_tools: 2,
            ..Default::default()
        };
        let processor = ToolEnhancementProcessor::with_config(config);
        let message = create_test_message();
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());

        // Should only have 2 tools
        assert_eq!(ctx.available_tools.len(), 2);
    }
}

