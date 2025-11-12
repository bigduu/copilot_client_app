//! Context Hints Enhancer
//!
//! Adds contextual information about files and tools to the system prompt.

use super::PromptEnhancer;
use crate::pipeline::context::{ProcessingContext, PromptFragment};

/// Context Hints Enhancer
///
/// Adds contextual information to the system prompt, such as:
/// - Number of files referenced in the message
/// - Number of tools available
/// - Other relevant context information
///
/// # Priority
///
/// This enhancer uses priority 40, placing it after more critical enhancements
/// like role context (90), tools (60), and Mermaid (50).
pub struct ContextHintsEnhancer;

impl ContextHintsEnhancer {
    /// Create a new context hints enhancer
    pub fn new() -> Self {
        Self
    }

    /// Generate context hints based on the processing context
    fn generate_hints(&self, ctx: &ProcessingContext) -> String {
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
}

impl Default for ContextHintsEnhancer {
    fn default() -> Self {
        Self::new()
    }
}

impl PromptEnhancer for ContextHintsEnhancer {
    fn name(&self) -> &str {
        "context_hints"
    }

    fn enhance(&self, ctx: &ProcessingContext) -> Option<PromptFragment> {
        let hints = self.generate_hints(ctx);

        if hints.is_empty() {
            log::debug!("[ContextHintsEnhancer] No context hints to add, skipping");
            return None;
        }

        log::debug!("[ContextHintsEnhancer] Adding context hints to prompt (priority: 40)");

        Some(PromptFragment {
            content: hints,
            source: "context_hints".to_string(),
            priority: 40,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::context::FileContent;
    use crate::pipeline::context::ToolDefinition;
    use crate::structs::context::ChatContext;
    use crate::structs::message::{ContentPart, InternalMessage, Role};
    use std::path::PathBuf;
    use uuid::Uuid;

    fn create_test_context() -> ChatContext {
        ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "test".to_string())
    }

    fn create_test_message() -> InternalMessage {
        InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text("test message")],
            ..Default::default()
        }
    }

    #[test]
    fn test_context_hints_no_context() {
        let message = create_test_message();
        let mut context = create_test_context();
        let proc_ctx = ProcessingContext::new(message, &mut context);
        let enhancer = ContextHintsEnhancer::new();

        let result = enhancer.enhance(&proc_ctx);
        assert!(result.is_none());
    }

    #[test]
    fn test_context_hints_with_files() {
        let message = create_test_message();
        let mut context = create_test_context();
        let mut proc_ctx = ProcessingContext::new(message, &mut context);

        // Add some file contents
        proc_ctx.add_file_content(FileContent {
            path: "test.rs".into(),
            content: "fn main() {}".to_string(),
            start_line: None,
            end_line: None,
            size_bytes: 13,
            mime_type: Some("text/x-rust".to_string()),
        });

        let enhancer = ContextHintsEnhancer::new();
        let result = enhancer.enhance(&proc_ctx);
        assert!(result.is_some());

        let fragment = result.unwrap();
        assert_eq!(fragment.source, "context_hints");
        assert_eq!(fragment.priority, 40);
        assert!(fragment.content.contains("1 file(s)"));
    }

    #[test]
    fn test_context_hints_with_tools() {
        let message = create_test_message();
        let mut context = create_test_context();
        let mut proc_ctx = ProcessingContext::new(message, &mut context);

        // Add some tools
        proc_ctx.add_tool(ToolDefinition {
            name: "test_tool".to_string(),
            description: "A test tool".to_string(),
            category: "Test".to_string(),
            parameters_schema: serde_json::json!({}),
            requires_approval: false,
        });

        let enhancer = ContextHintsEnhancer::new();
        let result = enhancer.enhance(&proc_ctx);
        assert!(result.is_some());

        let fragment = result.unwrap();
        assert_eq!(fragment.source, "context_hints");
        assert_eq!(fragment.priority, 40);
        assert!(fragment.content.contains("1 tool(s)"));
    }
}
