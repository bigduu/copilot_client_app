use serde::{Serialize, Deserialize};
use uuid::Uuid;
use crate::structs::metadata::MessageMetadata;
use crate::structs::tool::{ToolCallRequest, ToolCallResult};

/// A node in the message graph, stored in the message_pool.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageNode {
    pub id: Uuid,
    pub message: InternalMessage,
    pub parent_id: Option<Uuid>, // Retained for structural integrity and visualization
}

/// The unified internal message structure.
#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
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