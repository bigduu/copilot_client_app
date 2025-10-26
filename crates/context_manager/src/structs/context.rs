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
            },
            message_pool: HashMap::new(),
            branches,
            active_branch_name: "main".to_string(),
            current_state: ContextState::Idle,
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
    }

    pub fn get_active_branch(&self) -> Option<&Branch> {
        self.branches.get(&self.active_branch_name)
    }

    pub fn get_active_branch_mut(&mut self) -> Option<&mut Branch> {
        self.branches.get_mut(&self.active_branch_name)
    }
}

/// The configuration for a ChatContext.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String, // e.g., "planning", "coding", "tool-use"
    pub parameters: HashMap<String, serde_json::Value>, // e.g., temperature
}