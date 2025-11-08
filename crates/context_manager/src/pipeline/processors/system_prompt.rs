//! System Prompt Processor
//!
//! This processor assembles the final system prompt by merging all prompt fragments.

use crate::pipeline::context::ProcessingContext;
use crate::pipeline::error::ProcessError;
use crate::pipeline::result::ProcessResult;
use crate::pipeline::traits::MessageProcessor;

/// System Prompt Processor
///
/// Assembles the final system prompt by:
/// 1. Starting with a base system prompt
/// 2. Adding mode-specific instructions (Plan/Act)
/// 3. Merging all collected prompt fragments (sorted by priority)
/// 4. Adding context hints (branch info, state, etc.)
///
/// This processor should typically run last in the pipeline.
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::processors::SystemPromptProcessor;
/// use context_manager::pipeline::MessagePipeline;
///
/// let processor = SystemPromptProcessor::with_base_prompt(
///     "You are a helpful AI assistant."
/// );
/// let pipeline = MessagePipeline::new()
///     .register(Box::new(processor));
/// ```
pub struct SystemPromptProcessor {
    config: SystemPromptConfig,
}

/// System Prompt Configuration
#[derive(Debug, Clone)]
pub struct SystemPromptConfig {
    /// Base system prompt
    pub base_prompt: String,

    /// Include mode instructions
    pub include_mode_instructions: bool,

    /// Include context hints
    pub include_context_hints: bool,

    /// Include branch information
    pub include_branch_info: bool,
}

impl Default for SystemPromptConfig {
    fn default() -> Self {
        Self {
            base_prompt: "You are a helpful AI coding assistant.".to_string(),
            include_mode_instructions: true,
            include_context_hints: true,
            include_branch_info: false,
        }
    }
}

impl SystemPromptProcessor {
    /// Create a new system prompt processor with default config
    pub fn new() -> Self {
        Self {
            config: SystemPromptConfig::default(),
        }
    }

    /// Create with a specific base prompt
    pub fn with_base_prompt(base_prompt: impl Into<String>) -> Self {
        let mut config = SystemPromptConfig::default();
        config.base_prompt = base_prompt.into();
        Self { config }
    }

    /// Create with custom configuration
    pub fn with_config(config: SystemPromptConfig) -> Self {
        Self { config }
    }

    /// Generate mode-specific instructions
    fn get_mode_instructions(&self, _ctx: &ProcessingContext) -> String {
        // TODO: Get actual mode from context
        // For now, return generic instructions

        String::from(
            r#"
## Your Role

You are an AI coding assistant helping developers with their tasks. You should:

- Provide accurate, helpful responses
- Use available tools when appropriate
- Ask clarifying questions when needed
- Write clean, well-documented code
- Follow best practices and conventions
"#,
        )
    }

    /// Generate context hints
    fn get_context_hints(&self, ctx: &ProcessingContext) -> String {
        let mut hints = String::new();

        // File context
        if !ctx.file_contents.is_empty() {
            hints.push_str("\n## Context Information\n\n");
            hints.push_str(&format!(
                "The user has referenced {} file(s) in their message.\n",
                ctx.file_contents.len()
            ));
        }

        // Tool availability
        if !ctx.available_tools.is_empty() {
            if hints.is_empty() {
                hints.push_str("\n## Context Information\n\n");
            }
            hints.push_str(&format!(
                "You have {} tool(s) available to help accomplish the task.\n",
                ctx.available_tools.len()
            ));
        }

        hints
    }

    /// Assemble the final system prompt
    fn assemble_prompt(&self, ctx: &ProcessingContext) -> String {
        let mut prompt = String::new();

        // 1. Base prompt
        prompt.push_str(&self.config.base_prompt);
        prompt.push_str("\n");

        // 2. Mode instructions
        if self.config.include_mode_instructions {
            prompt.push_str(&self.get_mode_instructions(ctx));
        }

        // 3. Prompt fragments (sorted by priority)
        let fragments = ctx.get_sorted_prompt_fragments();
        for fragment in fragments {
            prompt.push_str(&fragment.content);
        }

        // 4. Context hints
        if self.config.include_context_hints {
            prompt.push_str(&self.get_context_hints(ctx));
        }

        // 5. Final instructions
        prompt.push_str(
            r#"

## Important Guidelines

- Always provide accurate and helpful information
- Use tools when they can help accomplish the task
- Be concise but thorough in explanations
- Format code with proper syntax highlighting
- Ask for clarification when requirements are unclear
"#,
        );

        prompt
    }
}

impl Default for SystemPromptProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl MessageProcessor for SystemPromptProcessor {
    fn name(&self) -> &str {
        "system_prompt"
    }

    fn process<'a>(&self, ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError> {
        // Assemble the final system prompt
        let system_prompt = self.assemble_prompt(ctx);

        // Store in metadata for later use
        ctx.add_metadata("final_system_prompt", serde_json::json!(system_prompt));

        // Add statistics
        ctx.add_metadata(
            "system_prompt_length",
            serde_json::json!(system_prompt.len()),
        );
        ctx.add_metadata(
            "prompt_fragments_count",
            serde_json::json!(ctx.prompt_fragments.len()),
        );

        Ok(ProcessResult::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::context::PromptFragment;
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
    fn test_system_prompt_generation() {
        let processor = SystemPromptProcessor::new();
        let message = create_test_message();
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());

        // Should have system prompt in metadata
        assert!(ctx.get_metadata("final_system_prompt").is_some());
        assert!(ctx.get_metadata("system_prompt_length").is_some());
    }

    #[test]
    fn test_custom_base_prompt() {
        let processor = SystemPromptProcessor::with_base_prompt("Custom prompt");
        let message = create_test_message();
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());

        let prompt = ctx
            .get_metadata("final_system_prompt")
            .and_then(|v| v.as_str())
            .unwrap();

        assert!(prompt.contains("Custom prompt"));
    }

    #[test]
    fn test_prompt_with_fragments() {
        let processor = SystemPromptProcessor::new();
        let message = create_test_message();
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        // Add some prompt fragments
        ctx.add_prompt_fragment(PromptFragment {
            content: "## Tool Instructions\n\nUse tools wisely.\n".to_string(),
            source: "tool_enhancement".to_string(),
            priority: 60,
        });

        ctx.add_prompt_fragment(PromptFragment {
            content: "## File Context\n\nFiles loaded.\n".to_string(),
            source: "file_reference".to_string(),
            priority: 70,
        });

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());

        let prompt = ctx
            .get_metadata("final_system_prompt")
            .and_then(|v| v.as_str())
            .unwrap();

        // Higher priority fragment should appear first
        let tool_pos = prompt.find("Tool Instructions");
        let file_pos = prompt.find("File Context");
        assert!(file_pos < tool_pos);
    }

    #[test]
    fn test_context_hints() {
        use crate::pipeline::context::{FileContent, ToolDefinition};
        use std::path::PathBuf;

        let processor = SystemPromptProcessor::new();
        let message = create_test_message();
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        // Add some file contents
        ctx.add_file_content(FileContent {
            path: PathBuf::from("test.rs"),
            content: "fn main() {}".to_string(),
            start_line: None,
            end_line: None,
            size_bytes: 13,
            mime_type: Some("text/x-rust".to_string()),
        });

        // Add some tools
        ctx.add_tool(ToolDefinition {
            name: "test_tool".to_string(),
            description: "A test tool".to_string(),
            category: "Test".to_string(),
            parameters_schema: serde_json::json!({}),
            requires_approval: false,
        });

        let hints = processor.get_context_hints(&ctx);

        // Should mention files and tools
        assert!(hints.contains("file(s)"));
        assert!(hints.contains("tool(s)"));
    }
}
