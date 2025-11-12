//! System Prompt Processor
//!
//! This processor assembles the final system prompt using an internal enhancer pipeline.

use crate::pipeline::context::ProcessingContext;
use crate::pipeline::enhancers::PromptEnhancer;
use crate::pipeline::error::ProcessError;
use crate::pipeline::result::ProcessResult;
use crate::pipeline::traits::MessageProcessor;

/// System Prompt Processor
///
/// Assembles the final system prompt by:
/// 1. Starting with a base system prompt
/// 2. Adding mode-specific instructions (Plan/Act)
/// 3. Running internal enhancers to add content (sorted by priority)
///
/// This processor should typically run last in the pipeline.
pub struct SystemPromptProcessor {
    config: SystemPromptConfig,
    enhancers: Vec<Box<dyn PromptEnhancer>>,
}

/// System Prompt Configuration
#[derive(Debug, Clone)]
pub struct SystemPromptConfig {
    /// Base system prompt
    pub base_prompt: String,

    /// Include mode instructions (role definitions)
    pub include_mode_instructions: bool,
}

impl Default for SystemPromptConfig {
    fn default() -> Self {
        Self {
            base_prompt: "You are a helpful AI coding assistant.".to_string(),
            include_mode_instructions: true,
        }
    }
}

impl SystemPromptProcessor {
    /// Create a new system prompt processor with default config and no enhancers
    pub fn new() -> Self {
        Self {
            config: SystemPromptConfig::default(),
            enhancers: Vec::new(),
        }
    }

    /// Create with a specific base prompt and no enhancers
    pub fn with_base_prompt(base_prompt: impl Into<String>) -> Self {
        Self {
            config: SystemPromptConfig {
                base_prompt: base_prompt.into(),
                ..Default::default()
            },
            enhancers: Vec::new(),
        }
    }

    /// Create with custom configuration and no enhancers
    pub fn with_config(config: SystemPromptConfig) -> Self {
        Self {
            config,
            enhancers: Vec::new(),
        }
    }

    /// Register an enhancer to the internal pipeline
    ///
    /// Enhancers are executed in the order they are registered.
    /// Their output fragments are then sorted by priority.
    pub fn register_enhancer(mut self, enhancer: Box<dyn PromptEnhancer>) -> Self {
        self.enhancers.push(enhancer);
        self
    }

    /// Create with default enhancers
    ///
    /// Default enhancers include:
    /// - RoleContextEnhancer (priority 90)
    /// - ToolEnhancementEnhancer (priority 60)
    /// - MermaidEnhancementEnhancer (priority 50)
    /// - ContextHintsEnhancer (priority 40)
    pub fn with_default_enhancers(base_prompt: impl Into<String>) -> Self {
        use crate::pipeline::enhancers::*;

        Self::with_base_prompt(base_prompt)
            .register_enhancer(Box::new(RoleContextEnhancer::new()))
            .register_enhancer(Box::new(ToolEnhancementEnhancer::new()))
            .register_enhancer(Box::new(MermaidEnhancementEnhancer::new()))
            .register_enhancer(Box::new(ContextHintsEnhancer::new()))
    }

    /// Generate mode-specific instructions
    ///
    /// This defines ALL available agent roles and their responsibilities.
    /// The current active role will be specified separately by RoleContextEnhancer.
    fn get_mode_instructions(&self, _ctx: &ProcessingContext) -> String {
        String::from(
            r#"
## Agent Roles

You can operate in two distinct roles. The current active role will be specified in each conversation.

### PLANNER Role

**Responsibilities:**
- Analyze requirements and create detailed execution plans
- Read files, search code, and gather information
- Propose structured strategies and approaches
- Ask clarifying questions when requirements are unclear

**Permissions:**
✅ Read files
✅ Search codebase
✅ List directories
❌ Write, create, or delete files
❌ Execute commands

**Behavior Guidelines:**
- Focus on analysis and planning
- Provide detailed step-by-step plans
- Suggest approaches but don't execute them
- Always ask for user approval before taking action

**Output Format:**
When creating a plan, use this JSON format:
```json
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
```

### ACTOR Role

**Responsibilities:**
- Execute approved plans and implement changes
- Write, modify, and delete files as needed
- Run commands and tests
- Iterate on solutions based on feedback

**Permissions:**
✅ Read files
✅ Search codebase
✅ List directories
✅ Write, create, and delete files
✅ Execute commands

**Behavior Guidelines:**
- Execute tasks efficiently and accurately
- Test changes thoroughly
- Report progress and results clearly
- Ask for clarification when execution details are unclear

**Important:**
- When switching from PLANNER to ACTOR, you should execute the approved plan
- When switching from ACTOR to PLANNER, you should analyze the current state and create a new plan

## Role Switching

The user can switch your role at any time. When this happens:
1. Acknowledge the role change
2. Adjust your behavior according to the new role's permissions
3. Continue the conversation in the context of the new role
"#,
        )
    }

    /// Assemble the final system prompt using enhancers
    fn assemble_prompt(&self, ctx: &ProcessingContext) -> String {
        let mut prompt = String::new();

        // 1. Base prompt
        prompt.push_str(&self.config.base_prompt);
        prompt.push('\n');

        // 2. Mode instructions (defines all available roles)
        if self.config.include_mode_instructions {
            prompt.push_str(&self.get_mode_instructions(ctx));
        }

        // 3. Run enhancers and collect fragments
        let mut fragments: Vec<crate::pipeline::context::PromptFragment> = Vec::new();

        for enhancer in &self.enhancers {
            if let Some(fragment) = enhancer.enhance(ctx) {
                log::debug!(
                    "[SystemPromptProcessor] Enhancer '{}' added fragment (priority: {})",
                    enhancer.name(),
                    fragment.priority
                );
                fragments.push(fragment);
            } else {
                log::debug!(
                    "[SystemPromptProcessor] Enhancer '{}' skipped",
                    enhancer.name()
                );
            }
        }

        // Sort fragments by priority (higher priority first)
        fragments.sort_by_key(|f| std::cmp::Reverse(f.priority));

        // 4. Add fragments to prompt
        for fragment in fragments {
            prompt.push_str(&fragment.content);
        }

        // 5. Final instructions
        prompt.push_str(
            r#"

## Important Guidelines

- Always provide accurate and helpful information
- Use tools when they can help accomplish the task
- Be concise but thorough in explanations
- Format code with proper syntax highlighting
- Ask for clarification when requirements are unclear
"#,
        );

        prompt
    }
}

impl Default for SystemPromptProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl MessageProcessor for SystemPromptProcessor {
    fn name(&self) -> &str {
        "SystemPromptProcessor"
    }

    fn process(&self, ctx: &mut ProcessingContext) -> Result<ProcessResult, ProcessError> {
        let prompt = self.assemble_prompt(ctx);

        // Store the final system prompt in metadata
        ctx.add_metadata("final_system_prompt", serde_json::json!(prompt));
        ctx.add_metadata("system_prompt_length", serde_json::json!(prompt.len()));

        log::debug!(
            "[SystemPromptProcessor] Assembled system prompt ({} bytes)",
            prompt.len()
        );

        Ok(ProcessResult::Continue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processor_creation() {
        let processor = SystemPromptProcessor::with_base_prompt("Test prompt");
        assert_eq!(processor.config.base_prompt, "Test prompt");
        assert_eq!(processor.config.include_mode_instructions, true);
        assert_eq!(processor.enhancers.len(), 0);
    }

    #[test]
    fn test_with_default_enhancers() {
        let processor = SystemPromptProcessor::with_default_enhancers("Test prompt");
        assert_eq!(processor.config.base_prompt, "Test prompt");
        assert_eq!(processor.enhancers.len(), 4); // 4 default enhancers
    }

    #[test]
    fn test_register_enhancer() {
        use crate::pipeline::enhancers::RoleContextEnhancer;

        let processor = SystemPromptProcessor::with_base_prompt("Test")
            .register_enhancer(Box::new(RoleContextEnhancer::new()));

        assert_eq!(processor.enhancers.len(), 1);
    }
}
