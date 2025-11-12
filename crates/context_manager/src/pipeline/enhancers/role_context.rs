//! Role Context Enhancer
//!
//! Injects the current active agent role into the system prompt.

use super::PromptEnhancer;
use crate::pipeline::context::{ProcessingContext, PromptFragment};
use crate::structs::context_agent::AgentRole;

/// Role Context Enhancer
///
/// Injects the current active agent role into the system prompt.
/// This allows the AI to know which role it should operate in for the current conversation.
///
/// # Purpose
///
/// While SystemPromptProcessor defines ALL available roles and their responsibilities,
/// RoleContextEnhancer dynamically injects which role is currently active.
///
/// # Priority
///
/// This enhancer uses priority 90, ensuring it appears near the top of the prompt
/// after mode instructions but before tool definitions.
pub struct RoleContextEnhancer;

impl RoleContextEnhancer {
    /// Create a new role context enhancer
    pub fn new() -> Self {
        Self
    }
}

impl Default for RoleContextEnhancer {
    fn default() -> Self {
        Self::new()
    }
}

impl PromptEnhancer for RoleContextEnhancer {
    fn name(&self) -> &str {
        "role_context"
    }

    fn enhance(&self, ctx: &ProcessingContext) -> Option<PromptFragment> {
        // Read current agent role from context
        let agent_role = &ctx.chat_context.config.agent_role;

        // Create role hint fragment
        let role_name = match agent_role {
            AgentRole::Planner => "PLANNER",
            AgentRole::Actor => "ACTOR",
        };

        let role_hint = format!(
            r#"
## Current Active Role

**You are currently operating in {} mode.**

Please follow the responsibilities, permissions, and behavior guidelines defined for this role.
"#,
            role_name
        );

        log::debug!(
            "[RoleContextEnhancer] Injecting active role: {} (priority: 90)",
            role_name
        );

        Some(PromptFragment {
            content: role_hint,
            source: "role_context".to_string(),
            priority: 90,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structs::context::ChatContext;
    use crate::structs::context_agent::AgentRole;
    use crate::structs::message::InternalMessage;
    use uuid::Uuid;

    fn create_test_context(role: AgentRole) -> ChatContext {
        let mut context =
            ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "test".to_string());
        context.config.agent_role = role;
        context
    }

    fn create_test_message() -> InternalMessage {
        InternalMessage {
            role: crate::structs::message::Role::User,
            content: vec![crate::structs::message::ContentPart::text("test message")],
            ..Default::default()
        }
    }

    #[test]
    fn test_role_context_enhancer_planner() {
        let message = create_test_message();
        let mut context = create_test_context(AgentRole::Planner);
        let proc_ctx = ProcessingContext::new(message, &mut context);
        let enhancer = RoleContextEnhancer::new();

        let result = enhancer.enhance(&proc_ctx);
        assert!(result.is_some());

        let fragment = result.unwrap();
        assert_eq!(fragment.source, "role_context");
        assert_eq!(fragment.priority, 90);
        assert!(fragment.content.contains("PLANNER mode"));
    }

    #[test]
    fn test_role_context_enhancer_actor() {
        let message = create_test_message();
        let mut context = create_test_context(AgentRole::Actor);
        let proc_ctx = ProcessingContext::new(message, &mut context);
        let enhancer = RoleContextEnhancer::new();

        let result = enhancer.enhance(&proc_ctx);
        assert!(result.is_some());

        let fragment = result.unwrap();
        assert_eq!(fragment.source, "role_context");
        assert_eq!(fragment.priority, 90);
        assert!(fragment.content.contains("ACTOR mode"));
    }
}
