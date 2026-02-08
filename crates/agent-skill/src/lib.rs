//! Agent skill management crate.

pub mod context;
pub mod store;
pub mod types;

pub use store::{SkillStore, SkillUpdate};
pub use types::*;

use std::collections::HashSet;
use std::sync::Arc;

/// Skill manager instance (convenience wrapper around SkillStore).
#[derive(Clone)]
pub struct SkillManager {
    store: Arc<SkillStore>,
}

impl SkillManager {
    /// Create a new skill manager with default configuration.
    pub fn new() -> Self {
        Self {
            store: Arc::new(SkillStore::default()),
        }
    }

    /// Create a new skill manager with custom configuration.
    pub fn with_config(config: SkillStoreConfig) -> Self {
        Self {
            store: Arc::new(SkillStore::new(config)),
        }
    }

    /// Initialize the manager.
    pub async fn initialize(&self) -> SkillResult<()> {
        self.store.initialize().await
    }

    /// Get the underlying store.
    pub fn store(&self) -> &SkillStore {
        &self.store
    }

    /// Build system prompt context from enabled skills.
    pub async fn build_skill_context(&self, chat_id: Option<&str>) -> String {
        log::debug!("Building skill context for chat_id: {:?}", chat_id);
        let skills = self.store.get_enabled_skills(chat_id).await;
        log::info!("Found {} enabled skill(s) for chat_id: {:?}", skills.len(), chat_id);
        context::build_skill_context(&skills)
    }

    /// Get allowed tool refs based on enabled skills.
    pub async fn get_allowed_tools(&self, chat_id: Option<&str>) -> Vec<String> {
        let skills = self.store.get_enabled_skills(chat_id).await;

        let mut tools: Vec<String> = skills
            .into_iter()
            .flat_map(|skill| skill.tool_refs)
            .collect::<HashSet<_>>()
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
