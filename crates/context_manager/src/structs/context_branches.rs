use crate::structs::branch::Branch;
use crate::structs::context::ChatContext;
use crate::structs::message::{InternalMessage, MessageNode};
use uuid::Uuid;

impl ChatContext {
    pub fn add_message_to_branch(&mut self, branch_name: &str, message: InternalMessage) -> Uuid {
        let content_len = message
            .content
            .iter()
            .filter_map(|c| c.text_content())
            .map(|s| s.len())
            .sum::<usize>();

        tracing::info!(
            context_id = %self.id,
            branch = %branch_name,
            role = ?message.role,
            content_len = content_len,
            has_tool_calls = message.tool_calls.is_some(),
            "ChatContext: Adding message to branch"
        );

        let branch = self.branches.get_mut(branch_name).unwrap();
        let message_id = Uuid::new_v4();
        let parent_id = branch.message_ids.last().cloned();

        tracing::debug!(
            context_id = %self.id,
            message_id = %message_id,
            parent_id = ?parent_id,
            pool_size_before = self.message_pool.len(),
            "ChatContext: Inserting message into pool"
        );

        let node = MessageNode {
            id: message_id,
            message,
            parent_id,
        };
        self.message_pool.insert(message_id, node);
        branch.message_ids.push(message_id);

        tracing::debug!(
            context_id = %self.id,
            branch = %branch_name,
            pool_size_after = self.message_pool.len(),
            branch_message_count = branch.message_ids.len(),
            "ChatContext: Message added successfully"
        );

        self.mark_dirty();

        message_id
    }

    pub fn get_active_branch(&self) -> Option<&Branch> {
        let branch = self.branches.get(&self.active_branch_name);
        tracing::debug!(
            context_id = %self.id,
            branch_name = %self.active_branch_name,
            found = branch.is_some(),
            message_count = branch.map(|b| b.message_ids.len()).unwrap_or(0),
            "ChatContext: get_active_branch"
        );
        branch
    }

    pub fn get_active_branch_mut(&mut self) -> Option<&mut Branch> {
        tracing::debug!(
            context_id = %self.id,
            branch_name = %self.active_branch_name,
            "ChatContext: get_active_branch_mut (mutable access)"
        );
        self.branches.get_mut(&self.active_branch_name)
    }

    pub fn set_active_branch_system_prompt(
        &mut self,
        system_prompt: crate::structs::branch::SystemPrompt,
    ) {
        tracing::info!(
            context_id = %self.id,
            branch = %self.active_branch_name,
            prompt_id = %system_prompt.id,
            "ChatContext: Setting system prompt"
        );
        if let Some(branch) = self.branches.get_mut(&self.active_branch_name) {
            branch.system_prompt = Some(system_prompt);
            self.mark_dirty();
        }
    }

    pub fn clear_active_branch_system_prompt(&mut self) {
        tracing::info!(
            context_id = %self.id,
            branch = %self.active_branch_name,
            "ChatContext: Clearing system prompt"
        );
        if let Some(branch) = self.branches.get_mut(&self.active_branch_name) {
            branch.system_prompt = None;
            self.mark_dirty();
        }
    }

    pub fn get_active_branch_system_prompt(&self) -> Option<&crate::structs::branch::SystemPrompt> {
        let prompt = self
            .branches
            .get(&self.active_branch_name)
            .and_then(|branch| branch.system_prompt.as_ref());
        tracing::debug!(
            context_id = %self.id,
            branch = %self.active_branch_name,
            has_prompt = prompt.is_some(),
            "ChatContext: get_active_branch_system_prompt"
        );
        prompt
    }
}
