//! System Prompt Snapshot
//!
//! Captures the complete system prompt that was sent to the LLM for debugging and tracing.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::structs::context_agent::AgentRole;

/// System Prompt Snapshot - saved to system_prompt.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemPromptSnapshot {
    /// Snapshot version (increments with each update)
    pub version: u64,

    /// Generation timestamp
    pub generated_at: DateTime<Utc>,

    /// Context ID
    pub context_id: Uuid,

    /// Current agent role
    pub agent_role: AgentRole,

    /// Base prompt source
    pub base_prompt_source: PromptSource,

    /// Final enhanced system prompt (the actual content sent to LLM)
    pub enhanced_prompt: String,

    /// Prompt fragments detail (optional, for debugging)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fragments: Option<Vec<PromptFragmentInfo>>,

    /// Available tools list (tool names)
    pub available_tools: Vec<String>,

    /// Statistics
    pub stats: PromptStats,
}

/// Prompt source
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum PromptSource {
    /// Loaded from SystemPromptService
    Service { prompt_id: String },
    /// Branch custom prompt
    Branch { branch_name: String },
    /// Default prompt
    Default,
}

/// Prompt fragment information (for debugging)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptFragmentInfo {
    /// Fragment source (e.g., "tool_enhancement", "role_context")
    pub source: String,
    /// Priority
    pub priority: u8,
    /// Fragment length
    pub length: usize,
    /// Preview (first 100 characters)
    pub preview: String,
}

/// Statistics
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptStats {
    /// Total prompt length
    pub total_length: usize,
    /// Number of fragments
    pub fragment_count: usize,
    /// Number of tools
    pub tool_count: usize,
    /// Enhancement time in milliseconds
    pub enhancement_time_ms: u64,
}

impl SystemPromptSnapshot {
    /// Create a new snapshot
    pub fn new(
        version: u64,
        context_id: Uuid,
        agent_role: AgentRole,
        base_prompt_source: PromptSource,
        enhanced_prompt: String,
        available_tools: Vec<String>,
    ) -> Self {
        let total_length = enhanced_prompt.len();
        let tool_count = available_tools.len();

        Self {
            version,
            generated_at: Utc::now(),
            context_id,
            agent_role,
            base_prompt_source,
            enhanced_prompt,
            fragments: None,
            available_tools,
            stats: PromptStats {
                total_length,
                fragment_count: 0,
                tool_count,
                enhancement_time_ms: 0,
            },
        }
    }

    /// Get a preview of the enhanced prompt (first 200 characters)
    pub fn preview(&self) -> String {
        let preview_len = 200.min(self.enhanced_prompt.len());
        format!("{}...", &self.enhanced_prompt[..preview_len])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapshot_creation() {
        let snapshot = SystemPromptSnapshot::new(
            1,
            Uuid::new_v4(),
            AgentRole::Actor,
            PromptSource::Default,
            "Test prompt".to_string(),
            vec!["read_file".to_string(), "write_file".to_string()],
        );

        assert_eq!(snapshot.version, 1);
        assert_eq!(snapshot.stats.total_length, 11);
        assert_eq!(snapshot.stats.tool_count, 2);
    }

    #[test]
    fn test_snapshot_serialization() {
        let snapshot = SystemPromptSnapshot::new(
            1,
            Uuid::new_v4(),
            AgentRole::Planner,
            PromptSource::Service {
                prompt_id: "default".to_string(),
            },
            "You are a helpful assistant.".to_string(),
            vec!["read_file".to_string()],
        );

        let json = serde_json::to_string_pretty(&snapshot).unwrap();
        assert!(json.contains("\"version\": 1"));
        assert!(json.contains("\"agent_role\": \"planner\""));
    }
}
