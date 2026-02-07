use builtin_tools::normalize_tool_ref;
use copilot_agent_core::tools::{FunctionSchema, ToolSchema};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

/// Skill definition loaded from filesystem
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default)]
    pub tool_refs: Vec<String>,
    #[serde(default)]
    pub workflow_refs: Vec<String>,
    #[serde(default)]
    pub visibility: SkillVisibility,
    #[serde(default)]
    pub enabled_by_default: bool,
    pub version: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillVisibility {
    Public,
    Private,
}

impl Default for SkillVisibility {
    fn default() -> Self {
        SkillVisibility::Public
    }
}

/// Skill loader - loads skills from filesystem and converts to tools
pub struct SkillLoader {
    skills_dir: PathBuf,
}

impl SkillLoader {
    /// Create new skill loader with default directory (~/.bodhi/skills)
    pub fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| std::env::temp_dir());
        Self {
            skills_dir: home.join(".bodhi").join("skills"),
        }
    }

    /// Create skill loader with custom directory
    #[allow(dead_code)]
    pub fn with_dir(path: PathBuf) -> Self {
        Self { skills_dir: path }
    }

    /// Load all enabled skills from filesystem
    pub async fn load_skills(&self) -> Vec<SkillDefinition> {
        let mut skills = Vec::new();

        if !self.skills_dir.exists() {
            println!("⚠️  Skills directory does not exist: {:?}", self.skills_dir);
            log::warn!("Skills directory does not exist: {:?}", self.skills_dir);
            return skills;
        }
        println!("📁 Loading skills from: {:?}", self.skills_dir);

        let mut entries = match fs::read_dir(&self.skills_dir).await {
            Ok(entries) => entries,
            Err(e) => {
                log::warn!("Failed to read skills directory: {}", e);
                return skills;
            }
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if !path.extension().map_or(false, |ext| ext == "md") {
                continue;
            }
            match fs::read_to_string(&path).await {
                Ok(content) => match parse_markdown_skill(&path, &content) {
                    Ok(skill) => {
                        if skill.enabled_by_default {
                            println!(
                                "✅ Loaded skill: {} ({}) - enabled by default",
                                skill.name, skill.id
                            );
                            log::info!("Loaded skill: {} ({})", skill.name, skill.id);
                            skills.push(skill);
                        } else {
                            println!(
                                "⏭️  Skipped skill: {} ({}) - not enabled by default",
                                skill.name, skill.id
                            );
                            log::debug!(
                                "Skipped skill: {} ({}) - not enabled by default",
                                skill.name,
                                skill.id
                            );
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to parse skill file {:?}: {}", path, e);
                    }
                },
                Err(e) => {
                    log::warn!("Failed to read skill file {:?}: {}", path, e);
                }
            }
        }

        log::info!("Loaded {} enabled skills", skills.len());
        skills
    }

    /// Convert skills to system prompt additions
    pub fn skills_to_system_prompt(skills: &[SkillDefinition]) -> String {
        if skills.is_empty() {
            return String::new();
        }

        let mut prompt =
            String::from("\n\nYou have access to the following specialized skills:\n\n");

        for skill in skills {
            prompt.push_str(&format!("## {}\n{}\n\n", skill.name, skill.description));

            if !skill.prompt.is_empty() {
                prompt.push_str(&format!("Instructions: {}\n\n", skill.prompt));
            }

            if !skill.tool_refs.is_empty() {
                prompt.push_str(&format!(
                    "Available tools: {}\n",
                    skill.tool_refs.join(", ")
                ));
            }

            if !skill.workflow_refs.is_empty() {
                prompt.push_str(&format!(
                    "Available workflows: {}\n",
                    skill.workflow_refs.join(", ")
                ));
            }

            prompt.push('\n');
        }

        prompt
    }

    /// Get additional tool schemas from skills
    /// Skills can define "virtual tools" through tool_refs
    pub fn get_skill_tool_schemas(skills: &[SkillDefinition]) -> Vec<ToolSchema> {
        let mut schemas = Vec::new();
        let mut seen_tools = std::collections::HashSet::new();

        for skill in skills {
            for tool_ref in &skill.tool_refs {
                // tool_ref format: "tool_name" or "category::tool_name"
                let tool_name = tool_ref.split("::").last().unwrap_or(tool_ref);

                if seen_tools.insert(tool_name.to_string()) {
                    // Create a schema for this skill-associated tool
                    schemas.push(ToolSchema {
                        schema_type: "function".to_string(),
                        function: FunctionSchema {
                            name: tool_name.to_string(),
                            description: format!("Tool associated with skill: {}", skill.name),
                            parameters: serde_json::json!({
                                "type": "object",
                                "properties": {},
                                "description": "See skill documentation for usage"
                            }),
                        },
                    });
                }
            }
        }

        schemas
    }

    /// Build complete system prompt with base prompt + skills
    pub fn build_system_prompt(base_prompt: &str, skills: &[SkillDefinition]) -> String {
        let skills_prompt = Self::skills_to_system_prompt(skills);

        if skills_prompt.is_empty() {
            base_prompt.to_string()
        } else {
            format!("{}{}", base_prompt, skills_prompt)
        }
    }
}

fn parse_markdown_skill(path: &Path, content: &str) -> Result<SkillDefinition, String> {
    let (frontmatter_raw, body) = split_frontmatter(content)?;
    let frontmatter: SkillFrontmatter =
        serde_yaml::from_str(&frontmatter_raw).map_err(|e| e.to_string())?;

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    if file_stem != frontmatter.id {
        return Err(format!(
            "Skill id '{}' does not match filename '{}'",
            frontmatter.id, file_stem
        ));
    }

    if !is_valid_skill_id(&frontmatter.id) {
        return Err(format!("Invalid skill ID: {}", frontmatter.id));
    }

    let mut tool_refs = Vec::new();
    for tool_ref in frontmatter.tool_refs {
        match normalize_tool_ref(&tool_ref) {
            Some(normalized) => tool_refs.push(normalized),
            None => {
                log::warn!(
                    "Skipping unsupported tool reference '{}' in {:?}",
                    tool_ref,
                    path
                );
            }
        }
    }

    Ok(SkillDefinition {
        id: frontmatter.id,
        name: frontmatter.name,
        description: frontmatter.description,
        category: frontmatter.category,
        tags: frontmatter.tags,
        prompt: body.trim().to_string(),
        tool_refs,
        workflow_refs: frontmatter.workflow_refs,
        visibility: frontmatter.visibility,
        enabled_by_default: frontmatter.enabled_by_default,
        version: frontmatter.version,
        created_at: frontmatter.created_at,
        updated_at: frontmatter.updated_at,
    })
}

fn split_frontmatter(content: &str) -> Result<(String, String), String> {
    let mut lines = content.lines();
    match lines.next() {
        Some("---") => {}
        _ => return Err("Missing YAML frontmatter".to_string()),
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

fn is_valid_skill_id(id: &str) -> bool {
    if id.is_empty() {
        return false;
    }

    if !id.chars().next().unwrap().is_ascii_lowercase() {
        return false;
    }

    id.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl Default for SkillLoader {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_skills_to_system_prompt() {
        let skills = vec![SkillDefinition {
            id: "test-skill".to_string(),
            name: "Test Skill".to_string(),
            description: "A test skill".to_string(),
            category: "test".to_string(),
            tags: vec![],
            prompt: "Use this skill for testing".to_string(),
            tool_refs: vec!["test_tool".to_string()],
            workflow_refs: vec![],
            visibility: SkillVisibility::Public,
            enabled_by_default: true,
            version: "1.0.0".to_string(),
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        }];

        let prompt = SkillLoader::skills_to_system_prompt(&skills);
        assert!(prompt.contains("Test Skill"));
        assert!(prompt.contains("Use this skill for testing"));
        assert!(prompt.contains("test_tool"));
    }

    #[test]
    fn test_build_system_prompt() {
        let base = "You are a helpful assistant.";
        let skills = vec![SkillDefinition {
            id: "test-skill".to_string(),
            name: "Test Skill".to_string(),
            description: "A test skill".to_string(),
            category: "test".to_string(),
            tags: vec![],
            prompt: "Use this skill for testing".to_string(),
            tool_refs: vec![],
            workflow_refs: vec![],
            visibility: SkillVisibility::Public,
            enabled_by_default: true,
            version: "1.0.0".to_string(),
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        }];

        let prompt = SkillLoader::build_system_prompt(base, &skills);
        assert!(prompt.starts_with(base));
        assert!(prompt.contains("Test Skill"));
    }

    #[test]
    fn test_parse_markdown_skill_skips_unsupported_tool_refs() {
        let content = r#"---
id: test-skill
name: Test Skill
description: A test skill
category: test
tags: []
tool_refs:
  - default::read_file
  - default::search
  - default::run_command
workflow_refs: []
visibility: public
enabled_by_default: true
version: 1.0.0
created_at: 2024-01-01T00:00:00Z
updated_at: 2024-01-01T00:00:00Z
---

Use this skill for testing
"#;

        let skill = parse_markdown_skill(Path::new("test-skill.md"), content)
            .expect("skill should still parse when unknown refs are present");

        assert_eq!(
            skill.tool_refs,
            vec!["read_file".to_string(), "execute_command".to_string()]
        );
    }
}
