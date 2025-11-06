use crate::structs::branch::SystemPrompt;
use crate::structs::context::ChatContext;
use crate::structs::context_agent::AgentRole;
use crate::structs::message::MessageNode;
use uuid::Uuid;

/// Immutable snapshot of the active branch state tailored for LLM requests.
#[derive(Clone, Debug, Default)]
pub struct BranchSnapshot {
    pub name: String,
    pub system_prompt: Option<SystemPrompt>,
    pub user_prompt: Option<String>,
    pub messages: Vec<MessageNode>,
}

/// High-level snapshot capturing everything needed to prepare an LLM request.
#[derive(Clone, Debug)]
pub struct LlmContextSnapshot {
    pub context_id: Uuid,
    pub model_id: String,
    pub mode: String,
    pub agent_role: AgentRole,
    pub system_prompt_id: Option<String>,
    pub total_messages: usize,
    pub branch: BranchSnapshot,
}

impl ChatContext {
    /// Capture the active branch along with configuration details required by adapters.
    pub fn llm_snapshot(&self) -> LlmContextSnapshot {
        let (system_prompt, user_prompt, message_ids): (
            Option<SystemPrompt>,
            Option<String>,
            Vec<Uuid>,
        ) = if let Some(branch) = self.branches.get(&self.active_branch_name) {
            (
                branch.system_prompt.clone(),
                branch.user_prompt.clone(),
                branch.message_ids.clone(),
            )
        } else {
            (None, None, Vec::new())
        };

        let messages = message_ids
            .iter()
            .filter_map(|id| self.message_pool.get(id))
            .cloned()
            .collect();

        LlmContextSnapshot {
            context_id: self.id,
            model_id: self.config.model_id.clone(),
            mode: self.config.mode.clone(),
            agent_role: self.config.agent_role.clone(),
            system_prompt_id: self.config.system_prompt_id.clone(),
            total_messages: self.message_pool.len(),
            branch: BranchSnapshot {
                name: self.active_branch_name.clone(),
                system_prompt,
                user_prompt,
                messages,
            },
        }
    }
}
