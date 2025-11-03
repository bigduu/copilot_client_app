//! System prompt enhancement service
//!
//! Enhances base system prompts with:
//! - Tool definitions
//! - Mermaid diagram support
//! - Contextual instructions

use anyhow::Result;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use std::collections::HashMap;

use tool_system::{format_tools_section, ToolRegistry, ToolPermission};
use context_manager::structs::context::AgentRole;
use crate::services::template_variable_service::TemplateVariableService;

/// Cache entry for enhanced prompts
#[derive(Clone)]
struct CachedPrompt {
    content: String,
    created_at: Instant,
}

/// Configuration for prompt enhancement
#[derive(Debug, Clone)]
pub struct EnhancementConfig {
    /// Enable tool injection
    pub enable_tools: bool,
    /// Enable Mermaid diagram support
    pub enable_mermaid: bool,
    /// Cache TTL in seconds
    pub cache_ttl: Duration,
    /// Maximum prompt size in characters
    pub max_prompt_size: usize,
}

impl Default for EnhancementConfig {
    fn default() -> Self {
        Self {
            enable_tools: true,
            enable_mermaid: true,
            cache_ttl: Duration::from_secs(300), // 5 minutes
            max_prompt_size: 100_000, // 100k characters
        }
    }
}

/// Service for enhancing system prompts
pub struct SystemPromptEnhancer {
    tool_registry: Arc<ToolRegistry>,
    config: EnhancementConfig,
    cache: Arc<RwLock<std::collections::HashMap<String, CachedPrompt>>>,
    template_service: Option<Arc<TemplateVariableService>>,
}

impl SystemPromptEnhancer {
    pub fn new(tool_registry: Arc<ToolRegistry>, config: EnhancementConfig) -> Self {
        Self {
            tool_registry,
            config,
            cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
            template_service: None,
        }
    }
    
    pub fn with_default_config(tool_registry: Arc<ToolRegistry>) -> Self {
        Self::new(tool_registry, EnhancementConfig::default())
    }

    /// Set template variable service for template replacement
    pub fn with_template_service(mut self, template_service: Arc<TemplateVariableService>) -> Self {
        self.template_service = Some(template_service);
        self
    }
    
    /// Enhance a base system prompt with tools and additional features
    /// 
    /// # Arguments
    /// * `base_prompt` - The base system prompt to enhance
    /// * `agent_role` - The agent's current role (determines available tools and behavior)
    pub async fn enhance_prompt(&self, base_prompt: &str, agent_role: &AgentRole) -> Result<String> {
        // Check cache first (include role in cache key)
        let cache_key = format!("{:?}:{}:{}", agent_role, base_prompt.len(), base_prompt.chars().take(50).collect::<String>());
        
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(&cache_key) {
                if cached.created_at.elapsed() < self.config.cache_ttl {
                    return Ok(cached.content.clone());
                }
            }
        }
        
        // Build enhanced prompt
        let mut enhanced = String::new();
        
        // Replace template variables in base prompt first
        let processed_prompt = self.replace_template_variables(base_prompt).await;
        
        // Add base prompt (with template variables replaced)
        enhanced.push_str(&processed_prompt);
        enhanced.push_str("\n\n");
        
        // Add role-specific instructions
        enhanced.push_str(&self.build_role_section(agent_role));
        enhanced.push_str("\n\n");
        
        // Add tools section if enabled (filtered by role)
        if self.config.enable_tools {
            let tools_section = self.build_tools_section(agent_role).await?;
            enhanced.push_str(&tools_section);
            enhanced.push_str("\n\n");
        }
        
        // Add Mermaid support if enabled
        if self.config.enable_mermaid {
            enhanced.push_str(&self.build_mermaid_section());
            enhanced.push_str("\n\n");
        }
        
        // Truncate if too large
        if enhanced.len() > self.config.max_prompt_size {
            log::warn!(
                "Enhanced prompt exceeds max size ({} > {}), truncating",
                enhanced.len(),
                self.config.max_prompt_size
            );
            enhanced.truncate(self.config.max_prompt_size);
            enhanced.push_str("\n\n[... prompt truncated due to size limits ...]");
        }
        
        // Update cache
        {
            let mut cache = self.cache.write().await;
            cache.insert(
                cache_key,
                CachedPrompt {
                    content: enhanced.clone(),
                    created_at: Instant::now(),
                },
            );
        }
        
        Ok(enhanced)
    }
    
    /// Build role-specific instructions
    fn build_role_section(&self, agent_role: &AgentRole) -> String {
        match agent_role {
            AgentRole::Planner => {
                r#"# CURRENT ROLE: PLANNER

You are operating in the PLANNER role. Your responsibilities:
1. Analyze the user's request thoroughly
2. Read necessary files and information (read-only access)
3. Create a detailed step-by-step plan
4. Discuss the plan with the user
5. Refine based on feedback

YOUR PERMISSIONS:
- ✅ Read files, search code, list directories
- ❌ Write, create, or delete files
- ❌ Execute commands

IMPORTANT:
- You CANNOT modify any files in this role
- Only read-only tools are available to you
- If you need write access, the user must switch you to ACTOR role
- After plan approval, the user will switch you to ACTOR role for execution

OUTPUT FORMAT:
When you create a plan, output it in the following JSON format:

{
  "goal": "Brief summary of what we're trying to accomplish",
  "steps": [
    {
      "step_number": 1,
      "action": "What you will do",
      "reason": "Why this is necessary",
      "tools_needed": ["list", "of", "tools"],
      "estimated_time": "rough estimate"
    }
  ],
  "estimated_total_time": "total time estimate",
  "risks": ["list any potential issues"],
  "prerequisites": ["anything user needs to prepare"]
}

After presenting the plan, discuss it with the user. When they approve, they will switch to ACT mode for execution.
"#.to_string()
            }
            AgentRole::Actor => {
                r#"# CURRENT ROLE: ACTOR

You are operating in the ACTOR role. Your responsibilities:
1. Execute the approved plan (if any)
2. Use all available tools to accomplish tasks
3. Make small adjustments as needed
4. Ask for approval on major changes

YOUR PERMISSIONS:
- ✅ Read, write, create, delete files
- ✅ Execute commands
- ✅ Full tool access

AUTONOMY GUIDELINES:
- **Small changes**: Proceed (formatting, obvious fixes, typos)
- **Medium changes**: Mention but proceed (refactoring within scope)
- **Large changes**: Ask via question format (delete files, major refactors, security changes)

QUESTION FORMAT:
When you need to ask for approval, use this format:

{
  "type": "question",
  "question": "Clear question for the user",
  "context": "Why you're asking / what you discovered",
  "severity": "critical" | "major" | "minor",
  "options": [
    {
      "label": "Short label",
      "value": "internal_value",
      "description": "Longer explanation"
    }
  ],
  "default": "recommended_value"
}

When to ask:
- ALWAYS: Deleting files, major refactors, security-sensitive changes
- USUALLY: Changes beyond original plan, uncertainty about approach
- RARELY: Minor formatting, obvious fixes, style adjustments
"#.to_string()
            }
        }
    }
    
    /// Build the tools section of the prompt, filtered by agent role
    async fn build_tools_section(&self, agent_role: &AgentRole) -> Result<String> {
        // Convert AgentRole permissions to ToolPermission
        let role_permissions: Vec<ToolPermission> = agent_role.permissions().iter().map(|p| {
            match p {
                context_manager::structs::context::Permission::ReadFiles => ToolPermission::ReadFiles,
                context_manager::structs::context::Permission::WriteFiles => ToolPermission::WriteFiles,
                context_manager::structs::context::Permission::CreateFiles => ToolPermission::CreateFiles,
                context_manager::structs::context::Permission::DeleteFiles => ToolPermission::DeleteFiles,
                context_manager::structs::context::Permission::ExecuteCommands => ToolPermission::ExecuteCommands,
            }
        }).collect();
        
        // Get filtered tools based on role permissions
        let tools = self.tool_registry.filter_tools_by_permissions(&role_permissions);
        
        if tools.is_empty() {
            return Ok(String::new());
        }
        
        Ok(format_tools_section(&tools))
    }
    
    /// Build the Mermaid diagram support section
    fn build_mermaid_section(&self) -> String {
        r#"
# MERMAID DIAGRAM SUPPORT

You can create diagrams using Mermaid syntax. When you want to show a diagram, use this format:

```mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
```

Supported diagram types:
- Flowcharts: `graph TD`, `graph LR`
- Sequence diagrams: `sequenceDiagram`
- Class diagrams: `classDiagram`
- State diagrams: `stateDiagram-v2`
- Entity relationship: `erDiagram`
- Gantt charts: `gantt`

Use Mermaid diagrams to visualize:
- System architecture
- Workflows and processes
- Data relationships
- State transitions
- Project timelines
"#.to_string()
    }
    
    /// Check if the request is in passthrough mode (standard OpenAI API)
    /// Passthrough mode uses base prompts without enhancement
    pub fn is_passthrough_mode(request_path: &str) -> bool {
        // Passthrough for standard OpenAI API endpoints
        request_path == "/v1/chat/completions" 
            || request_path == "/v1/models"
            || request_path.starts_with("/v1/embeddings")
    }
    
    /// Clear the cache
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    /// Replace template variables in prompt content
    /// Supports variables like {{variable_name}} or {variable_name}
    async fn replace_template_variables(&self, prompt: &str) -> String {
        let template_vars = if let Some(service) = &self.template_service {
            service.get_all().await
        } else {
            HashMap::new()
        };

        if template_vars.is_empty() {
            return prompt.to_string();
        }

        let mut result = prompt.to_string();

        // Replace {{key}} or {key} patterns
        for (key, value) in template_vars {
            // Replace {{key}}
            let pattern_double = format!("{{{{{}}}}}", key);
            result = result.replace(&pattern_double, &value);
            
            // Replace {key} (only if not already replaced and not part of {{key}})
            let pattern_single = format!("{{{}}}", key);
            // Only replace if it's not already inside {{ }}
            if !result.contains(&format!("{{{{{}", key)) {
                result = result.replace(&pattern_single, &value);
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_is_passthrough_mode() {
        assert!(SystemPromptEnhancer::is_passthrough_mode("/v1/chat/completions"));
        assert!(SystemPromptEnhancer::is_passthrough_mode("/v1/models"));
        assert!(SystemPromptEnhancer::is_passthrough_mode("/v1/embeddings/create"));
        
        assert!(!SystemPromptEnhancer::is_passthrough_mode("/context/chat"));
        assert!(!SystemPromptEnhancer::is_passthrough_mode("/api/chat"));
    }
    
    #[tokio::test]
    async fn test_enhance_prompt_basic() {
        let tool_registry = Arc::new(ToolRegistry::new());
        let enhancer = SystemPromptEnhancer::with_default_config(tool_registry);
        
        let base = "You are a helpful assistant.";
        let enhanced = enhancer.enhance_prompt(base, &AgentRole::Actor).await.unwrap();
        
        assert!(enhanced.contains(base));
        assert!(enhanced.contains("MERMAID"));
        assert!(enhanced.contains("ACTOR"));
    }
    
    #[tokio::test]
    async fn test_enhance_prompt_role_specific() {
        let tool_registry = Arc::new(ToolRegistry::new());
        let enhancer = SystemPromptEnhancer::with_default_config(tool_registry);
        
        let base = "You are a helpful assistant.";
        
        // Test Planner role
        let planner_prompt = enhancer.enhance_prompt(base, &AgentRole::Planner).await.unwrap();
        assert!(planner_prompt.contains("PLANNER"));
        assert!(planner_prompt.contains("read-only"));
        
        // Test Actor role
        let actor_prompt = enhancer.enhance_prompt(base, &AgentRole::Actor).await.unwrap();
        assert!(actor_prompt.contains("ACTOR"));
        assert!(actor_prompt.contains("Full tool access"));
        
        // They should be different
        assert_ne!(planner_prompt, actor_prompt);
    }
    
    #[tokio::test]
    async fn test_enhance_prompt_caching() {
        let tool_registry = Arc::new(ToolRegistry::new());
        let enhancer = SystemPromptEnhancer::with_default_config(tool_registry);
        
        let base = "You are a helpful assistant.";
        
        // First call
        let start = Instant::now();
        let enhanced1 = enhancer.enhance_prompt(base, &AgentRole::Actor).await.unwrap();
        let duration1 = start.elapsed();
        
        // Second call (should be cached)
        let start = Instant::now();
        let enhanced2 = enhancer.enhance_prompt(base, &AgentRole::Actor).await.unwrap();
        let duration2 = start.elapsed();
        
        assert_eq!(enhanced1, enhanced2);
        // Cache should be significantly faster (though this is not guaranteed in tests)
        log::debug!("First call: {:?}, Second call: {:?}", duration1, duration2);
    }
    
    #[tokio::test]
    async fn test_enhance_prompt_size_limit() {
        let tool_registry = Arc::new(ToolRegistry::new());
        let config = EnhancementConfig {
            max_prompt_size: 100, // Very small limit for testing
            ..Default::default()
        };
        let enhancer = SystemPromptEnhancer::new(tool_registry, config);
        
        let base = "a".repeat(200); // Longer than limit
        let enhanced = enhancer.enhance_prompt(&base, &AgentRole::Actor).await.unwrap();
        
        assert!(enhanced.len() <= 100 + 50); // Some buffer for truncation message
        assert!(enhanced.contains("truncated"));
    }
}

