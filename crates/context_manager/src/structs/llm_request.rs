use crate::structs::branch::SystemPrompt;
use crate::structs::context::ChatContext;
use crate::structs::context_agent::AgentRole;
use crate::structs::context_snapshot::LlmContextSnapshot;
use crate::structs::message::InternalMessage;
use uuid::Uuid;

/// Prepared request payload that callers can forward to an LLM adapter.
#[derive(Clone, Debug)]
pub struct PreparedLlmRequest {
    pub context_id: Uuid,
    pub model_id: String,
    pub mode: String,
    pub agent_role: AgentRole,
    pub system_prompt_id: Option<String>,
    pub branch_name: String,
    pub branch_system_prompt: Option<SystemPrompt>,
    pub branch_user_prompt: Option<String>,
    pub messages: Vec<InternalMessage>,
    pub total_messages: usize,
}

impl PreparedLlmRequest {
    fn from_snapshot(snapshot: LlmContextSnapshot) -> Self {
        let messages = snapshot
            .branch
            .messages
            .into_iter()
            .map(|node| node.message)
            .collect();

        Self {
            context_id: snapshot.context_id,
            model_id: snapshot.model_id,
            mode: snapshot.mode,
            agent_role: snapshot.agent_role,
            system_prompt_id: snapshot.system_prompt_id,
            branch_name: snapshot.branch.name,
            branch_system_prompt: snapshot.branch.system_prompt,
            branch_user_prompt: snapshot.branch.user_prompt,
            messages,
            total_messages: snapshot.total_messages,
        }
    }
}

impl ChatContext {
    /// Prepares a read-only request payload for the current context state.
    pub fn prepare_llm_request(&self) -> PreparedLlmRequest {
        let snapshot = self.llm_snapshot();
        PreparedLlmRequest::from_snapshot(snapshot)
    }
}

impl From<LlmContextSnapshot> for PreparedLlmRequest {
    fn from(value: LlmContextSnapshot) -> Self {
        PreparedLlmRequest::from_snapshot(value)
    }
}
