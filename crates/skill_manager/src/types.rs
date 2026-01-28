//! Skill Manager Types
//!
//! Defines the core data structures for the skill system:
//! - SkillDefinition: A skill's metadata and configuration
//! - SkillStore: In-memory storage and persistence layer

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Unique identifier for a skill (kebab-case)
pub type SkillId = String;

/// Visibility level for a skill
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillVisibility {
    /// Visible to all users
    Public,
    /// Private to the creator
    Private,
}

impl Default for SkillVisibility {
    fn default() -> Self {
        Self::Public
    }
}

/// Complete definition of a skill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    /// Unique identifier (kebab-case)
    pub id: SkillId,

    /// Display name
    pub name: String,

    /// Human-readable description
    pub description: String,

    /// Category for grouping
    pub category: String,

    /// Searchable tags
    #[serde(default)]
    pub tags: Vec<String>,

    /// Prompt fragment injected into system prompt
    pub prompt: String,

    /// MCP tool references (format: "server::tool")
    #[serde(default)]
    pub tool_refs: Vec<String>,

    /// Associated workflow names
    #[serde(default)]
    pub workflow_refs: Vec<String>,

    /// Visibility level
    #[serde(default)]
    pub visibility: SkillVisibility,

    /// Whether enabled by default
    #[serde(default)]
    pub enabled_by_default: bool,

    /// Semantic version
    #[serde(default = "default_version")]
    pub version: String,

    /// Creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

impl SkillDefinition {
    /// Create a new skill definition with generated timestamp
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        description: impl Into<String>,
        category: impl Into<String>,
        prompt: impl Into<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            category: category.into(),
            tags: Vec::new(),
            prompt: prompt.into(),
            tool_refs: Vec::new(),
            workflow_refs: Vec::new(),
            visibility: SkillVisibility::default(),
            enabled_by_default: false,
            version: default_version(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a tool reference
    pub fn with_tool_ref(mut self, tool_ref: impl Into<String>) -> Self {
        self.tool_refs.push(tool_ref.into());
        self
    }

    /// Add a workflow reference
    pub fn with_workflow_ref(mut self, workflow_ref: impl Into<String>) -> Self {
        self.workflow_refs.push(workflow_ref.into());
        self
    }

    /// Add a tag
    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Set visibility
    pub fn with_visibility(mut self, visibility: SkillVisibility) -> Self {
        self.visibility = visibility;
        self
    }

    /// Set enabled by default
    pub fn with_enabled_by_default(mut self, enabled: bool) -> Self {
        self.enabled_by_default = enabled;
        self
    }

    /// Update the timestamp
    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }

    /// Check if this is a built-in skill (based on id prefix or version)
    pub fn is_builtin(&self) -> bool {
        self.id.starts_with("builtin-") || self.id.starts_with("system-")
    }
}

/// Configuration for skill store persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillStoreConfig {
    /// Path to the skills storage file
    pub storage_path: std::path::PathBuf,
}

impl Default for SkillStoreConfig {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        Self {
            storage_path: home.join(".bodhi").join("skills.json"),
        }
    }
}

/// Enablement state for skills
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkillEnablement {
    /// Globally enabled skill IDs
    #[serde(default)]
    pub enabled_skill_ids: Vec<SkillId>,

    /// Per-chat skill overrides
    #[serde(default)]
    pub chat_overrides: HashMap<String, Vec<SkillId>>,
}

impl SkillEnablement {
    /// Check if a skill is enabled globally
    pub fn is_enabled_global(&self, skill_id: &str) -> bool {
        self.enabled_skill_ids.contains(&skill_id.to_string())
    }

    /// Check if a skill is enabled for a specific chat
    pub fn is_enabled_for_chat(&self, skill_id: &str, chat_id: &str) -> Option<bool> {
        self.chat_overrides
            .get(chat_id)
            .map(|ids| ids.contains(&skill_id.to_string()))
    }

    /// Get effective enablement (chat override takes precedence)
    pub fn is_enabled(&self, skill_id: &str, chat_id: Option<&str>) -> bool {
        if let Some(chat_id) = chat_id {
            if let Some(enabled) = self.is_enabled_for_chat(skill_id, chat_id) {
                return enabled;
            }
        }
        self.is_enabled_global(skill_id)
    }

    /// Enable a skill globally
    pub fn enable_global(&mut self, skill_id: impl Into<String>) {
        let id = skill_id.into();
        if !self.enabled_skill_ids.contains(&id) {
            self.enabled_skill_ids.push(id);
        }
    }

    /// Disable a skill globally
    pub fn disable_global(&mut self, skill_id: &str) {
        self.enabled_skill_ids.retain(|id| id != skill_id);
    }

    /// Enable a skill for a specific chat
    pub fn enable_for_chat(&mut self, skill_id: impl Into<String>, chat_id: impl Into<String>) {
        let chat_id = chat_id.into();
        let skill_id = skill_id.into();

        let entry = self.chat_overrides.entry(chat_id).or_default();
        if !entry.contains(&skill_id) {
            entry.push(skill_id);
        }
    }

    /// Disable a skill for a specific chat
    pub fn disable_for_chat(&mut self, skill_id: &str, chat_id: &str) {
        if let Some(entry) = self.chat_overrides.get_mut(chat_id) {
            entry.retain(|id| id != skill_id);
        }
    }

    /// Get all enabled skills for a chat (global + overrides)
    pub fn get_enabled_for_chat(&self, chat_id: Option<&str>) -> Vec<SkillId> {
        let mut result: Vec<SkillId> = self.enabled_skill_ids.clone();

        if let Some(chat_id) = chat_id {
            if let Some(overrides) = self.chat_overrides.get(chat_id) {
                // Add chat-specific enabled skills not already in global
                for id in overrides {
                    if !result.contains(id) {
                        result.push(id.clone());
                    }
                }
            }
        }

        result
    }
}

/// Filter options for listing skills
#[derive(Debug, Clone, Default)]
pub struct SkillFilter {
    /// Filter by category
    pub category: Option<String>,

    /// Filter by tags (any match)
    pub tags: Vec<String>,

    /// Search in name and description
    pub search: Option<String>,

    /// Filter by visibility
    pub visibility: Option<SkillVisibility>,

    /// Only enabled skills
    pub enabled_only: bool,
}

impl SkillFilter {
    /// Create a new empty filter
    pub fn new() -> Self {
        Self::default()
    }

    /// Filter by category
    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(category.into());
        self
    }

    /// Add a tag filter
    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Set search query
    pub fn with_search(mut self, search: impl Into<String>) -> Self {
        self.search = Some(search.into());
        self
    }

    /// Only enabled skills
    pub fn enabled_only(mut self) -> Self {
        self.enabled_only = true;
        self
    }

    /// Check if a skill matches this filter
    pub fn matches(&self, skill: &SkillDefinition, enablement: &SkillEnablement) -> bool {
        // Category filter
        if let Some(ref category) = self.category {
            if skill.category != *category {
                return false;
            }
        }

        // Tags filter (any match)
        if !self.tags.is_empty() {
            let has_matching_tag = self.tags.iter().any(|tag| skill.tags.contains(tag));
            if !has_matching_tag {
                return false;
            }
        }

        // Search filter
        if let Some(ref search) = self.search {
            let search_lower = search.to_lowercase();
            if !skill.name.to_lowercase().contains(&search_lower)
                && !skill.description.to_lowercase().contains(&search_lower)
            {
                return false;
            }
        }

        // Visibility filter
        if let Some(ref visibility) = self.visibility {
            if skill.visibility != *visibility {
                return false;
            }
        }

        // Enabled only filter
        if self.enabled_only && !enablement.is_enabled_global(&skill.id) {
            return false;
        }

        true
    }
}

/// Error types for skill operations
#[derive(Debug, thiserror::Error)]
pub enum SkillError {
    #[error("Skill not found: {0}")]
    NotFound(SkillId),

    #[error("Skill already exists: {0}")]
    AlreadyExists(SkillId),

    #[error("Invalid skill ID: {0}")]
    InvalidId(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Result type for skill operations
pub type SkillResult<T> = Result<T, SkillError>;
