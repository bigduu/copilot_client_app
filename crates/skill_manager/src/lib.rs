//! Skill Manager Crate
//!
//! Provides skill definition storage, management, and enablement tracking.
//! Skills bundle built-in tools, workflows, and prompt fragments for AI capability orchestration.

pub mod store;
pub mod types;

pub use store::{SkillStore, SkillUpdate};
pub use types::*;

use std::sync::Arc;

/// Skill manager instance (convenience wrapper around SkillStore)
#[derive(Clone)]
pub struct SkillManager {
    store: Arc<SkillStore>,
}

impl SkillManager {
    /// Create a new skill manager with default configuration
    pub fn new() -> Self {
        Self {
            store: Arc::new(SkillStore::default()),
        }
    }

    /// Create a new skill manager with custom configuration
    pub fn with_config(config: SkillStoreConfig) -> Self {
        Self {
            store: Arc::new(SkillStore::new(config)),
        }
    }

    /// Initialize the manager
    pub async fn initialize(&self) -> SkillResult<()> {
        self.store.initialize().await
    }

    /// Get the underlying store
    pub fn store(&self) -> &SkillStore {
        &self.store
    }

    /// Build system prompt context from enabled skills
    pub async fn build_skill_context(&self, chat_id: Option<&str>) -> String {
        let skills = self.store.get_enabled_skills(chat_id).await;

        if skills.is_empty() {
            return String::new();
        }

        let mut context = String::from("\n\n## Available Skills\n");

        for skill in skills {
            context.push_str(&format!("\n### {}\n", skill.name));
            context.push_str(&format!("{}", skill.description));

            if !skill.prompt.is_empty() {
                context.push_str(&format!("\n\n{}", skill.prompt));
            }

            if !skill.tool_refs.is_empty() {
                context.push_str("\n\n**Available Tools:** ");
                context.push_str(&skill.tool_refs.join(", "));
            }

            if !skill.workflow_refs.is_empty() {
                context.push_str("\n\n**Related Workflows:** ");
                context.push_str(&skill.workflow_refs.join(", "));
            }

            context.push('\n');
        }

        context
    }

    /// Get allowed tool refs based on enabled skills
    pub async fn get_allowed_tools(&self, chat_id: Option<&str>) -> Vec<String> {
        let skills = self.store.get_enabled_skills(chat_id).await;

        let mut tools: Vec<String> = skills
            .into_iter()
            .flat_map(|s| s.tool_refs)
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        tools.sort();
        tools
    }
}

impl Default for SkillManager {
    fn default() -> Self {
        Self::new()
    }
}
