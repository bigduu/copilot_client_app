use std::collections::HashMap;
use uuid::Uuid;
use serde::{Serialize, Deserialize};
use crate::structs::branch::Branch;
use crate::structs::message::{InternalMessage, MessageNode};
use crate::structs::state::ContextState;

/// Represents a complete conversational session. Can be a top-level chat or a sub-context.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatContext {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub config: ChatConfig,
    
    /// The single source of truth for all message data in this context.
    /// Provides O(1) lookup performance for any message by its ID.
    pub message_pool: HashMap<Uuid, MessageNode>,
    
    /// Manages all distinct lines of conversation within this context.
    pub branches: HashMap<String, Branch>,
    
    pub active_branch_name: String,

    /// The current state of the conversation lifecycle.
    #[serde(default)]
    pub current_state: ContextState,
    
    /// Runtime flag to track if context needs persistence (not serialized).
    /// Used to optimize auto-save by skipping redundant writes.
    #[serde(skip)]
    pub(crate) dirty: bool,
}

impl ChatContext {
    pub fn new(id: Uuid, model_id: String, mode: String) -> Self {
        let mut branches = HashMap::new();
        let main_branch = Branch::new("main".to_string());
        branches.insert("main".to_string(), main_branch);

        Self {
            id,
            parent_id: None,
            config: ChatConfig {
                model_id,
                mode,
                parameters: HashMap::new(),
                system_prompt_id: None,
            },
            message_pool: HashMap::new(),
            branches,
            active_branch_name: "main".to_string(),
            current_state: ContextState::Idle,
            dirty: false,
        }
    }

    pub fn add_message_to_branch(&mut self, branch_name: &str, message: InternalMessage) {
        let branch = self.branches.get_mut(branch_name).unwrap();
        let message_id = Uuid::new_v4();
        let parent_id = branch.message_ids.last().cloned();
        let node = MessageNode {
            id: message_id,
            message,
            parent_id,
        };
        self.message_pool.insert(message_id, node);
        branch.message_ids.push(message_id);
        self.mark_dirty();
    }

    pub fn get_active_branch(&self) -> Option<&Branch> {
        self.branches.get(&self.active_branch_name)
    }

    pub fn get_active_branch_mut(&mut self) -> Option<&mut Branch> {
        self.branches.get_mut(&self.active_branch_name)
    }
    
    /// Attach a system prompt to the active branch
    pub fn set_active_branch_system_prompt(&mut self, system_prompt: crate::structs::branch::SystemPrompt) {
        if let Some(branch) = self.branches.get_mut(&self.active_branch_name) {
            branch.system_prompt = Some(system_prompt);
            self.mark_dirty();
        }
    }
    
    /// Remove system prompt from the active branch
    pub fn clear_active_branch_system_prompt(&mut self) {
        if let Some(branch) = self.branches.get_mut(&self.active_branch_name) {
            branch.system_prompt = None;
            self.mark_dirty();
        }
    }
    
    /// Get system prompt from the active branch
    pub fn get_active_branch_system_prompt(&self) -> Option<&crate::structs::branch::SystemPrompt> {
        self.branches.get(&self.active_branch_name)
            .and_then(|branch| branch.system_prompt.as_ref())
    }
    
    /// Mark the context as dirty (needs persistence)
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }
    
    /// Clear the dirty flag (after successful persistence)
    pub fn clear_dirty(&mut self) {
        self.dirty = false;
    }
    
    /// Check if the context needs to be persisted
    pub fn is_dirty(&self) -> bool {
        self.dirty
    }
}

/// The configuration for a ChatContext.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String, // e.g., "planning", "coding", "tool-use"
    pub parameters: HashMap<String, serde_json::Value>, // e.g., temperature
    /// Optional system prompt ID to use for this context's branches
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt_id: Option<String>,
}