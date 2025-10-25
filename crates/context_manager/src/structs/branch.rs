use serde::{Serialize, Deserialize};
use uuid::Uuid;

/// Represents a single, coherent line of conversation with its own "personality".
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Branch {
    pub name: String,
    
    /// An ordered list of message IDs defining the history of this branch.
    /// This provides a performant, explicit representation of the conversation flow.
    pub message_ids: Vec<Uuid>,
    
    /// The specific system prompt that defines the behavior of this branch.
    pub system_prompt: Option<SystemPrompt>,
    
    /// An additional, user-provided prompt for this branch.
    pub user_prompt: Option<String>,
}

/// A specific system prompt definition.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemPrompt {
    pub id: String,
    pub content: String,
}