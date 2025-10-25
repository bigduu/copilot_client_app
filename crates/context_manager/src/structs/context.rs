use std::collections::HashMap;
use uuid::Uuid;
use serde::{Serialize, Deserialize};
use crate::structs::branch::Branch;
use crate::structs::message::MessageNode;

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
}

/// The configuration for a ChatContext.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String, // e.g., "planning", "coding", "tool-use"
    pub parameters: HashMap<String, serde_json::Value>, // e.g., temperature
}