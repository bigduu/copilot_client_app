//! Skill Store
//!
//! Provides in-memory storage and file persistence for skill definitions.

use crate::types::*;
use chrono::{DateTime, Utc};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkillFrontmatter {
    id: String,
    name: String,
    description: String,
    category: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    tool_refs: Vec<String>,
    #[serde(default)]
    workflow_refs: Vec<String>,
    visibility: SkillVisibility,
    enabled_by_default: bool,
    version: String,
    created_at: String,
    updated_at: String,
}

/// Persistent storage for skills
pub struct SkillStore {
    skills: RwLock<HashMap<SkillId, SkillDefinition>>,
    config: SkillStoreConfig,
}

impl SkillStore {
    /// Create a new skill store with the given configuration
    pub fn new(config: SkillStoreConfig) -> Self {
        Self {
            skills: RwLock::new(HashMap::new()),
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

        fs::create_dir_all(&self.config.skills_dir).await?;

        let loaded = self.load().await?;
        if loaded == 0 {
            info!("No existing skills found, creating built-in skills");
            self.create_builtin_skills().await?;
            self.load().await?;
        }

        info!("Skill store initialized");
        Ok(())
    }

    /// Load skills from disk
    async fn load(&self) -> SkillResult<usize> {
        debug!("Loading skills from {:?}", self.config.skills_dir);

        let mut entries = fs::read_dir(&self.config.skills_dir).await?;
        let mut loaded: HashMap<SkillId, SkillDefinition> = HashMap::new();

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if !path.extension().map_or(false, |ext| ext == "md") {
                continue;
            }

            match fs::read_to_string(&path).await {
                Ok(content) => match parse_markdown_skill(&path, &content) {
                    Ok(skill) => {
                        loaded.insert(skill.id.clone(), skill);
                    }
                    Err(e) => {
                        warn!("Failed to parse skill file {:?}: {}", path, e);
                    }
                },
                Err(e) => {
                    warn!("Failed to read skill file {:?}: {}", path, e);
                }
            }
        }

        let count = loaded.len();
        let mut skills = self.skills.write().await;
        *skills = loaded;

        info!("Loaded {} skills", count);
        Ok(count)
    }

    async fn create_builtin_skills(&self) -> SkillResult<()> {
        let builtins = Self::builtin_skills();

        for skill in builtins {
            let path = self
                .config
                .skills_dir
                .join(format!("{}.md", skill.id));
            if path.exists() {
                continue;
            }
            let content = render_skill_markdown(&skill)?;
            fs::write(path, content).await?;
        }

        Ok(())
    }

    fn builtin_skills() -> Vec<SkillDefinition> {
        vec![
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
        ]
    }

    // ==================== CRUD Operations ====================

    /// List all skills with optional filtering
    pub async fn list_skills(&self, filter: Option<SkillFilter>) -> Vec<SkillDefinition> {
        let skills = self.skills.read().await;

        let mut result: Vec<SkillDefinition> = skills
            .values()
            .filter(|skill| {
                if let Some(ref f) = filter {
                    f.matches(skill)
                } else {
                    true
                }
            })
            .cloned()
            .collect();

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
    pub async fn create_skill(&self, _skill: SkillDefinition) -> SkillResult<SkillDefinition> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    /// Update an existing skill
    pub async fn update_skill(&self, _id: &str, _updates: SkillUpdate) -> SkillResult<SkillDefinition> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    /// Delete a skill
    pub async fn delete_skill(&self, _id: &str) -> SkillResult<()> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    // ==================== Enablement Operations ====================

    /// Enable a skill globally
    pub async fn enable_skill_global(&self, _id: &str) -> SkillResult<()> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    /// Disable a skill globally
    pub async fn disable_skill_global(&self, _id: &str) -> SkillResult<()> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    /// Enable a skill for a specific chat
    pub async fn enable_skill_for_chat(&self, _skill_id: &str, _chat_id: &str) -> SkillResult<()> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    /// Disable a skill for a specific chat
    pub async fn disable_skill_for_chat(&self, _skill_id: &str, _chat_id: &str) -> SkillResult<()> {
        Err(SkillError::ReadOnly(
            "Skills are read-only and must be edited as Markdown files".to_string(),
        ))
    }

    /// Check if a skill is enabled
    pub async fn is_enabled(&self, skill_id: &str, _chat_id: Option<&str>) -> bool {
        self.skills
            .read()
            .await
            .get(skill_id)
            .map(|skill| skill.enabled_by_default)
            .unwrap_or(false)
    }

    /// Get all enabled skills
    pub async fn get_enabled_skills(&self, _chat_id: Option<&str>) -> Vec<SkillDefinition> {
        let skills = self.skills.read().await;
        skills
            .values()
            .filter(|skill| skill.enabled_by_default)
            .cloned()
            .collect()
    }

    // ==================== Utility Methods ====================

    pub fn skills_dir(&self) -> &PathBuf {
        &self.config.skills_dir
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

    /// Export skills to Markdown
    pub async fn export_to_markdown(
        &self,
        skill_ids: Option<Vec<String>>,
    ) -> SkillResult<String> {
        let skills = self.skills.read().await;

        let to_export: Vec<&SkillDefinition> = if let Some(ids) = skill_ids {
            ids.iter().filter_map(|id| skills.get(id)).collect()
        } else {
            skills.values().collect()
        };

        let mut chunks = Vec::new();
        for skill in to_export {
            chunks.push(render_skill_markdown(skill)?);
        }

        Ok(chunks.join("\n\n"))
    }
}

fn parse_markdown_skill(path: &Path, content: &str) -> SkillResult<SkillDefinition> {
    let (frontmatter_raw, body) = split_frontmatter(content)?;
    let frontmatter: SkillFrontmatter = serde_yaml::from_str(&frontmatter_raw)?;

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    if file_stem != frontmatter.id {
        return Err(SkillError::Validation(format!(
            "Skill id '{}' does not match filename '{}'",
            frontmatter.id, file_stem
        )));
    }

    if !is_valid_skill_id(&frontmatter.id) {
        return Err(SkillError::InvalidId(format!(
            "Invalid skill ID: {}. Use kebab-case (e.g., my-skill-name)",
            frontmatter.id
        )));
    }

    let created_at = parse_timestamp(&frontmatter.created_at)?;
    let updated_at = parse_timestamp(&frontmatter.updated_at)?;

    Ok(SkillDefinition {
        id: frontmatter.id,
        name: frontmatter.name,
        description: frontmatter.description,
        category: frontmatter.category,
        tags: frontmatter.tags,
        prompt: body.trim().to_string(),
        tool_refs: frontmatter.tool_refs,
        workflow_refs: frontmatter.workflow_refs,
        visibility: frontmatter.visibility,
        enabled_by_default: frontmatter.enabled_by_default,
        version: frontmatter.version,
        created_at,
        updated_at,
    })
}

fn split_frontmatter(content: &str) -> SkillResult<(String, String)> {
    let mut lines = content.lines();
    match lines.next() {
        Some("---") => {}
        _ => {
            return Err(SkillError::Validation(
                "Missing YAML frontmatter".to_string(),
            ))
        }
    }

    let mut frontmatter_lines = Vec::new();
    for line in lines.by_ref() {
        if line == "---" {
            break;
        }
        frontmatter_lines.push(line);
    }

    let frontmatter = frontmatter_lines.join("\n");
    let body = lines.collect::<Vec<_>>().join("\n");
    Ok((frontmatter, body))
}

fn parse_timestamp(value: &str) -> SkillResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| SkillError::Validation(format!("Invalid timestamp '{}': {}", value, e)))
}

fn render_skill_markdown(skill: &SkillDefinition) -> SkillResult<String> {
    let frontmatter = SkillFrontmatter {
        id: skill.id.clone(),
        name: skill.name.clone(),
        description: skill.description.clone(),
        category: skill.category.clone(),
        tags: skill.tags.clone(),
        tool_refs: skill.tool_refs.clone(),
        workflow_refs: skill.workflow_refs.clone(),
        visibility: skill.visibility.clone(),
        enabled_by_default: skill.enabled_by_default,
        version: skill.version.clone(),
        created_at: skill.created_at.to_rfc3339(),
        updated_at: skill.updated_at.to_rfc3339(),
    };

    let yaml = serde_yaml::to_string(&frontmatter)?;
    let body = skill.prompt.trim();

    Ok(format!("---\n{}---\n\n{}\n", yaml, body))
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

    if !id.chars().next().unwrap().is_ascii_lowercase() {
        return false;
    }

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
        assert!(!is_valid_skill_id("MySkill"));
        assert!(!is_valid_skill_id("123-skill"));
        assert!(!is_valid_skill_id("my_skill"));
        assert!(!is_valid_skill_id("my skill"));
    }

    #[tokio::test]
    async fn test_load_markdown_skills() {
        let dir = tempfile::tempdir().expect("tempdir");
        let skills_dir = dir.path().join("skills");
        fs::create_dir_all(&skills_dir).await.expect("create dir");

        let content = r#"---
 id: test-skill
 name: Test Skill
 description: A test skill
 category: test
 tags:
   - demo
 tool_refs:
   - default::read_file
 workflow_refs: []
 visibility: public
 enabled_by_default: true
 version: 1.0.0
 created_at: "2026-02-01T00:00:00Z"
 updated_at: "2026-02-01T00:00:00Z"
---
Use this skill for testing.
"#;

        let path = skills_dir.join("test-skill.md");
        fs::write(&path, content).await.expect("write");

        let config = SkillStoreConfig { skills_dir };
        let store = SkillStore::new(config);
        store.initialize().await.expect("initialize");

        let skills = store.list_skills(None).await;
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "test-skill");
        assert!(skills[0].enabled_by_default);
    }

    #[tokio::test]
    async fn test_create_builtin_skills() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = SkillStoreConfig {
            skills_dir: dir.path().join("skills"),
        };
        let store = SkillStore::new(config);
        store.initialize().await.expect("initialize");

        let skills = store.list_skills(None).await;
        assert!(!skills.is_empty());
    }
}
