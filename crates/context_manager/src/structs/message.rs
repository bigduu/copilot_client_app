use serde::{Serialize, Deserialize};
use std::fmt;
use uuid::Uuid;
use crate::structs::metadata::MessageMetadata;
use crate::structs::tool::{ToolCallRequest, ToolCallResult};

/// A node in the message graph, stored in the message_pool.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MessageNode {
    pub id: Uuid,
    pub message: InternalMessage,
    pub parent_id: Option<Uuid>, // Retained for structural integrity and visualization
}

/// The unified internal message structure.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct InternalMessage {
    pub role: Role,
    pub content: Vec<ContentPart>,
    
    /// If present, indicates this Assistant message is requesting tool calls.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallRequest>>,
    
    /// If present, indicates this Tool message is the result of a tool call.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<ToolCallResult>,
    
    pub metadata: Option<MessageMetadata>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub enum Role {
    System,
    #[default]
    User,
    Assistant,
    Tool,
}

impl fmt::Display for Role {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Role::System => write!(f, "system"),
            Role::User => write!(f, "user"),
            Role::Assistant => write!(f, "assistant"),
            Role::Tool => write!(f, "tool"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    Image {
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
}

impl ContentPart {
    pub fn text(s: &str) -> Self {
        ContentPart::Text { text: s.to_string() }
    }

    pub fn text_owned(s: String) -> Self {
        ContentPart::Text { text: s }
    }

    pub fn text_content(&self) -> Option<&str> {
        if let ContentPart::Text { text } = self {
            Some(text)
        } else {
            None
        }
    }
}