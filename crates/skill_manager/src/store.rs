//! Skill Store
//!
//! Provides in-memory storage and file persistence for skill definitions
//! and enablement state.

use crate::types::*;
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use tokio::sync::RwLock;

/// Persistent storage for skills
pub struct SkillStore {
    /// In-memory skill definitions
    skills: RwLock<HashMap<SkillId, SkillDefinition>>,

    /// Enablement state
    enablement: RwLock<SkillEnablement>,

    /// Storage configuration
    config: SkillStoreConfig,
}

impl SkillStore {
    /// Create a new skill store with the given configuration
    pub fn new(config: SkillStoreConfig) -> Self {
        Self {
            skills: RwLock::new(HashMap::new()),
            enablement: RwLock::new(SkillEnablement::default()),
            config,
        }
    }

    /// Create a new skill store with default configuration
    pub fn default() -> Self {
        Self::new(SkillStoreConfig::default())
    }

    /// Initialize the store, loading from disk if available
    pub async fn initialize(&self) -> SkillResult<()> {
        info!("Initializing skill store...");

        // Ensure storage directory exists
        if let Some(parent) = self.config.storage_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Load from disk if file exists
        if self.config.storage_path.exists() {
            self.load().await?;
        } else {
            info!("No existing skills storage found, starting fresh");
            // Create built-in skills
            self.create_builtin_skills().await?;
        }

        info!("Skill store initialized");
        Ok(())
    }

    /// Load skills from disk
    async fn load(&self) -> SkillResult<()> {
        debug!("Loading skills from {:?}", self.config.storage_path);

        let content = fs::read_to_string(&self.config.storage_path).await?;
        let data: SkillStorageData = serde_json::from_str(&content)?;

        let mut skills = self.skills.write().await;
        *skills = data.skills;

        let mut enablement = self.enablement.write().await;
        *enablement = data.enablement;

        info!(
            "Loaded {} skills, {} globally enabled",
            skills.len(),
            enablement.enabled_skill_ids.len()
        );

        Ok(())
    }

    /// Save skills to disk
    async fn save(&self) -> SkillResult<()> {
        debug!("Saving skills to {:?}", self.config.storage_path);

        let data = SkillStorageData {
            skills: self.skills.read().await.clone(),
            enablement: self.enablement.read().await.clone(),
        };

        let content = serde_json::to_string_pretty(&data)?;
        fs::write(&self.config.storage_path, content).await?;

        debug!("Skills saved successfully");
        Ok(())
    }

    /// Create built-in skills
    async fn create_builtin_skills(&self) -> SkillResult<()> {
        info!("Creating built-in skills...");

        let builtins = vec![
            SkillDefinition::new(
                "builtin-file-analysis",
                "File Analysis",
                "Read and analyze file contents, providing summaries and key information",
                "analysis",
                "You are a file analysis expert. Use the read_file tool to read files, then provide a structured analysis including:\n1. File type and purpose\n2. Main content summary\n3. Key code/data snippets\n4. Potential issues or improvements",
            )
            .with_tool_ref("default::read_file")
            .with_tool_ref("default::search")
            .with_tag("files")
            .with_tag("analysis")
            .with_enabled_by_default(true),

            SkillDefinition::new(
                "builtin-code-review",
                "Code Review",
                "Review code changes to identify potential issues and improvement opportunities",
                "development",
                "You are a code review expert. When analyzing code changes, focus on:\n1. Code quality and readability\n2. Potential bugs and security issues\n3. Performance impact\n4. Alignment with best practices\n5. Test coverage",
            )
            .with_tool_ref("default::read_file")
            .with_tool_ref("default::search")
            .with_tool_ref("default::run_command")
            .with_tag("code")
            .with_tag("review")
            .with_enabled_by_default(true),

            SkillDefinition::new(
                "builtin-project-setup",
                "Project Setup",
                "Help set up new projects by creating necessary configuration files and directory structures",
                "development",
                "You are a project setup expert. When helping users set up a new project:\n1. Analyze project type and requirements\n2. Create a recommended directory structure\n3. Generate basic configuration files\n4. Provide next-step guidance",
            )
            .with_workflow_ref("create-project")
            .with_tag("project")
            .with_tag("setup"),
        ];

        let mut skills = self.skills.write().await;
        for skill in builtins {
            skills.insert(skill.id.clone(), skill);
        }

        // Auto-enable built-in skills that are marked as enabled_by_default
        let mut enablement = self.enablement.write().await;
        for (_, skill) in skills.iter() {
            if skill.enabled_by_default {
                enablement.enable_global(&skill.id);
            }
        }

        // Save to disk
        drop(skills);
        drop(enablement);
        self.save().await?;

        info!("Built-in skills created");
        Ok(())
    }

    // ==================== CRUD Operations ====================

    /// List all skills with optional filtering
    pub async fn list_skills(&self, filter: Option<SkillFilter>) -> Vec<SkillDefinition> {
        let skills = self.skills.read().await;
        let enablement = self.enablement.read().await;

        let mut result: Vec<SkillDefinition> = skills
            .values()
            .filter(|skill| {
                if let Some(ref f) = filter {
                    f.matches(skill, &enablement)
                } else {
                    true
                }
            })
            .cloned()
            .collect();

        // Sort by name
        result.sort_by(|a, b| a.name.cmp(&b.name));

        result
    }

    /// Get a single skill by ID
    pub async fn get_skill(&self, id: &str) -> SkillResult<SkillDefinition> {
        let skills = self.skills.read().await;
        skills
            .get(id)
            .cloned()
            .ok_or_else(|| SkillError::NotFound(id.to_string()))
    }

    /// Create a new skill
    pub async fn create_skill(
        &self,
        mut skill: SkillDefinition,
    ) -> SkillResult<SkillDefinition> {
        // Validate ID
        if skill.id.is_empty() {
            return Err(SkillError::InvalidId("Skill ID cannot be empty".to_string()));
        }

        if !is_valid_skill_id(&skill.id) {
            return Err(SkillError::InvalidId(format!(
                "Invalid skill ID: {}. Use kebab-case (e.g., my-skill-name)",
                skill.id
            )));
        }

        let mut skills = self.skills.write().await;

        // Check for duplicates
        if skills.contains_key(&skill.id) {
            return Err(SkillError::AlreadyExists(skill.id));
        }

        // Ensure timestamps are set
        let now = chrono::Utc::now();
        skill.created_at = now;
        skill.updated_at = now;

        info!("Creating skill: {}", skill.id);
        skills.insert(skill.id.clone(), skill.clone());
        drop(skills);

        // Save to disk
        self.save().await?;

        Ok(skill)
    }

    /// Update an existing skill
    pub async fn update_skill(
        &self,
        id: &str,
        updates: SkillUpdate,
    ) -> SkillResult<SkillDefinition> {
        let mut skills = self.skills.write().await;

        let skill = skills
            .get_mut(id)
            .ok_or_else(|| SkillError::NotFound(id.to_string()))?;

        // Apply updates
        if let Some(name) = updates.name {
            skill.name = name;
        }
        if let Some(description) = updates.description {
            skill.description = description;
        }
        if let Some(category) = updates.category {
            skill.category = category;
        }
        if let Some(tags) = updates.tags {
            skill.tags = tags;
        }
        if let Some(prompt) = updates.prompt {
            skill.prompt = prompt;
        }
        if let Some(tool_refs) = updates.tool_refs {
            skill.tool_refs = tool_refs;
        }
        if let Some(workflow_refs) = updates.workflow_refs {
            skill.workflow_refs = workflow_refs;
        }
        if let Some(visibility) = updates.visibility {
            skill.visibility = visibility;
        }
        if let Some(enabled_by_default) = updates.enabled_by_default {
            skill.enabled_by_default = enabled_by_default;
        }
        if let Some(version) = updates.version {
            skill.version = version;
        }

        skill.touch();

        let updated = skill.clone();
        drop(skills);

        info!("Updated skill: {}", id);
        self.save().await?;

        Ok(updated)
    }

    /// Delete a skill
    pub async fn delete_skill(&self, id: &str) -> SkillResult<()> {
        let mut skills = self.skills.write().await;

        if !skills.contains_key(id) {
            return Err(SkillError::NotFound(id.to_string()));
        }

        info!("Deleting skill: {}", id);
        skills.remove(id);
        drop(skills);

        // Also remove from enablement
        let mut enablement = self.enablement.write().await;
        enablement.disable_global(id);
        for (_, ids) in enablement.chat_overrides.iter_mut() {
            ids.retain(|skill_id| skill_id != id);
        }
        drop(enablement);

        self.save().await?;

        Ok(())
    }

    // ==================== Enablement Operations ====================

    /// Enable a skill globally
    pub async fn enable_skill_global(&self, id: &str) -> SkillResult<()> {
        // Verify skill exists
        if !self.skills.read().await.contains_key(id) {
            return Err(SkillError::NotFound(id.to_string()));
        }

        let mut enablement = self.enablement.write().await;
        enablement.enable_global(id);
        drop(enablement);

        info!("Enabled skill globally: {}", id);
        self.save().await?;

        Ok(())
    }

    /// Disable a skill globally
    pub async fn disable_skill_global(&self, id: &str) -> SkillResult<()> {
        let mut enablement = self.enablement.write().await;
        enablement.disable_global(id);
        drop(enablement);

        info!("Disabled skill globally: {}", id);
        self.save().await?;

        Ok(())
    }

    /// Enable a skill for a specific chat
    pub async fn enable_skill_for_chat(
        &self,
        skill_id: &str,
        chat_id: &str,
    ) -> SkillResult<()> {
        // Verify skill exists
        if !self.skills.read().await.contains_key(skill_id) {
            return Err(SkillError::NotFound(skill_id.to_string()));
        }

        let mut enablement = self.enablement.write().await;
        enablement.enable_for_chat(skill_id, chat_id);
        drop(enablement);

        info!("Enabled skill {} for chat {}", skill_id, chat_id);
        self.save().await?;

        Ok(())
    }

    /// Disable a skill for a specific chat
    pub async fn disable_skill_for_chat(
        &self,
        skill_id: &str,
        chat_id: &str,
    ) -> SkillResult<()> {
        let mut enablement = self.enablement.write().await;
        enablement.disable_for_chat(skill_id, chat_id);
        drop(enablement);

        info!("Disabled skill {} for chat {}", skill_id, chat_id);
        self.save().await?;

        Ok(())
    }

    /// Get enablement state
    pub async fn get_enablement(&self) -> SkillEnablement {
        self.enablement.read().await.clone()
    }

    /// Check if a skill is enabled
    pub async fn is_enabled(&self, skill_id: &str, chat_id: Option<&str>) -> bool {
        self.enablement.read().await.is_enabled(skill_id, chat_id)
    }

    /// Get all enabled skills for a chat
    pub async fn get_enabled_skills(
        &self,
        chat_id: Option<&str>,
    ) -> Vec<SkillDefinition> {
        let enablement = self.enablement.read().await;
        let skills = self.skills.read().await;

        let enabled_ids = enablement.get_enabled_for_chat(chat_id);

        enabled_ids
            .iter()
            .filter_map(|id| skills.get(id).cloned())
            .collect()
    }

    // ==================== Utility Methods ====================

    /// Get storage path
    pub fn storage_path(&self) -> &PathBuf {
        &self.config.storage_path
    }

    /// Get all categories
    pub async fn get_categories(&self) -> Vec<String> {
        let skills = self.skills.read().await;
        let mut categories: Vec<String> = skills
            .values()
            .map(|s| s.category.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        categories.sort();
        categories
    }

    /// Get all tags
    pub async fn get_all_tags(&self) -> Vec<String> {
        let skills = self.skills.read().await;
        let mut tags: Vec<String> = skills
            .values()
            .flat_map(|s| s.tags.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        tags.sort();
        tags
    }

    /// Export skills to JSON
    pub async fn export_to_json(&self, skill_ids: Option<Vec<String>>) -> SkillResult<String> {
        let skills = self.skills.read().await;

        let to_export: Vec<&SkillDefinition> = if let Some(ids) = skill_ids {
            ids.iter()
                .filter_map(|id| skills.get(id))
                .collect()
        } else {
            skills.values().collect()
        };

        let export_data = SkillExportData {
            version: "1.0".to_string(),
            skills: to_export.into_iter().cloned().collect(),
        };

        Ok(serde_json::to_string_pretty(&export_data)?)
    }

    /// Import skills from JSON
    pub async fn import_from_json(&self, json: &str) -> SkillResult<Vec<SkillDefinition>> {
        let import_data: SkillExportData = serde_json::from_str(json)?;

        let mut imported = Vec::new();
        for mut skill in import_data.skills {
            // Generate new ID if conflicts
            if self.skills.read().await.contains_key(&skill.id) {
                skill.id = format!("{}-imported-{}", skill.id, chrono::Utc::now().timestamp());
            }

            match self.create_skill(skill).await {
                Ok(created) => imported.push(created),
                Err(e) => {
                    warn!("Failed to import skill: {}", e);
                }
            }
        }

        Ok(imported)
    }
}

/// Data structure for storage serialization
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkillStorageData {
    #[serde(default)]
    skills: HashMap<SkillId, SkillDefinition>,
    #[serde(default)]
    enablement: SkillEnablement,
}

/// Data structure for export/import
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkillExportData {
    version: String,
    skills: Vec<SkillDefinition>,
}

/// Update fields for skill modification
#[derive(Debug, Clone, Default)]
pub struct SkillUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub prompt: Option<String>,
    pub tool_refs: Option<Vec<String>>,
    pub workflow_refs: Option<Vec<String>>,
    pub visibility: Option<SkillVisibility>,
    pub enabled_by_default: Option<bool>,
    pub version: Option<String>,
}

impl SkillUpdate {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(category.into());
        self
    }

    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = Some(tags);
        self
    }

    pub fn with_prompt(mut self, prompt: impl Into<String>) -> Self {
        self.prompt = Some(prompt.into());
        self
    }

    pub fn with_tool_refs(mut self, tool_refs: Vec<String>) -> Self {
        self.tool_refs = Some(tool_refs);
        self
    }

    pub fn with_workflow_refs(mut self, workflow_refs: Vec<String>) -> Self {
        self.workflow_refs = Some(workflow_refs);
        self
    }

    pub fn with_visibility(mut self, visibility: SkillVisibility) -> Self {
        self.visibility = Some(visibility);
        self
    }

    pub fn with_enabled_by_default(mut self, enabled: bool) -> Self {
        self.enabled_by_default = Some(enabled);
        self
    }

    pub fn with_version(mut self, version: impl Into<String>) -> Self {
        self.version = Some(version.into());
        self
    }
}

/// Validate skill ID format (kebab-case)
fn is_valid_skill_id(id: &str) -> bool {
    if id.is_empty() {
        return false;
    }

    // Must start with letter
    if !id.chars().next().unwrap().is_ascii_lowercase() {
        return false;
    }

    // Can contain lowercase letters, numbers, and hyphens
    id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_skill_ids() {
        assert!(is_valid_skill_id("my-skill"));
        assert!(is_valid_skill_id("skill123"));
        assert!(is_valid_skill_id("a-b-c"));
        assert!(is_valid_skill_id("builtin-file-analysis"));
    }

    #[test]
    fn test_invalid_skill_ids() {
        assert!(!is_valid_skill_id(""));
        assert!(!is_valid_skill_id("MySkill")); // uppercase
        assert!(!is_valid_skill_id("123-skill")); // starts with number
        assert!(!is_valid_skill_id("my_skill")); // underscore
        assert!(!is_valid_skill_id("my skill")); // space
    }
}
