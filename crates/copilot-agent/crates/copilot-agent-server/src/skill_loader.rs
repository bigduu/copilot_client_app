use std::path::PathBuf;
use tokio::fs;
use serde::{Deserialize, Serialize};
use copilot_agent_core::tools::{ToolSchema, FunctionSchema};

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
        Self {
            skills_dir: path,
        }
    }
    
    /// Load all enabled skills from filesystem
    pub async fn load_skills(&self) -> Vec<SkillDefinition> {
        let mut skills = Vec::new();
        
        if !self.skills_dir.exists() {
            log::debug!("Skills directory does not exist: {:?}", self.skills_dir);
            return skills;
        }
        
        let mut entries = match fs::read_dir(&self.skills_dir).await {
            Ok(entries) => entries,
            Err(e) => {
                log::warn!("Failed to read skills directory: {}", e);
                return skills;
            }
        };
        
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                match fs::read_to_string(&path).await {
                    Ok(content) => {
                        match serde_json::from_str::<SkillDefinition>(&content) {
                            Ok(skill) => {
                                if skill.enabled_by_default {
                                    log::debug!("Loaded skill: {} ({})", skill.name, skill.id);
                                    skills.push(skill);
                                }
                            }
                            Err(e) => {
                                log::warn!("Failed to parse skill file {:?}: {}", path, e);
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to read skill file {:?}: {}", path, e);
                    }
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
        
        let mut prompt = String::from("\n\nYou have access to the following specialized skills:\n\n");
        
        for skill in skills {
            prompt.push_str(&format!(
                "## {}\n{}\n\n",
                skill.name,
                skill.description
            ));
            
            if !skill.prompt.is_empty() {
                prompt.push_str(&format!("Instructions: {}\n\n", skill.prompt));
            }
            
            if !skill.tool_refs.is_empty() {
                prompt.push_str(&format!("Available tools: {}\n", skill.tool_refs.join(", ")));
            }
            
            if !skill.workflow_refs.is_empty() {
                prompt.push_str(&format!("Available workflows: {}\n", skill.workflow_refs.join(", ")));
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

impl Default for SkillLoader {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_skills_to_system_prompt() {
        let skills = vec![
            SkillDefinition {
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
            }
        ];
        
        let prompt = SkillLoader::skills_to_system_prompt(&skills);
        assert!(prompt.contains("Test Skill"));
        assert!(prompt.contains("Use this skill for testing"));
        assert!(prompt.contains("test_tool"));
    }

    #[test]
    fn test_build_system_prompt() {
        let base = "You are a helpful assistant.";
        let skills = vec![
            SkillDefinition {
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
            }
        ];
        
        let prompt = SkillLoader::build_system_prompt(base, &skills);
        assert!(prompt.starts_with(base));
        assert!(prompt.contains("Test Skill"));
    }
}
