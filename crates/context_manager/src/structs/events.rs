use crate::structs::message::{InternalMessage, MessageType, Role};
use crate::structs::state::ContextState;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Represents a structured update that frontend or other subscribers can consume
/// to keep an accurate replica of the current chat context. Each update captures
/// the latest state transition, optional message mutation, and arbitrary metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextUpdate {
    /// Identifier of the chat context that emitted this update.
    pub context_id: Uuid,

    /// The state after applying this update.
    pub current_state: ContextState,

    /// The state before applying this update (if available).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_state: Option<ContextState>,

    /// Optional message-level mutation bundled in this update.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_update: Option<MessageUpdate>,

    /// Timestamp when the update was produced.
    pub timestamp: DateTime<Utc>,

    /// Additional structured metadata useful for consumers.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Describes granular mutations to messages emitted alongside a [`ContextUpdate`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageUpdate {
    /// Indicates a new message has been created and added to the context.
    Created {
        message_id: Uuid,
        role: Role,
        message_type: MessageType,
    },

    /// Represents a streaming content delta for an in-flight assistant message.
    ContentDelta {
        message_id: Uuid,
        delta: String,
        accumulated: String,
    },

    /// Signals that a message is finalised with its full `InternalMessage` payload.
    Completed {
        message_id: Uuid,
        final_message: InternalMessage,
    },

    /// Marks a status transition for a message (e.g. tool approval states).
    StatusChanged {
        message_id: Uuid,
        old_status: String,
        new_status: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structs::message::{ContentPart, InternalMessage};
    use serde_json::json;

    #[test]
    fn context_update_serializes_with_created_message() {
        let update = ContextUpdate {
            context_id: Uuid::nil(),
            current_state: ContextState::ProcessingUserMessage,
            previous_state: Some(ContextState::Idle),
            message_update: Some(MessageUpdate::Created {
                message_id: Uuid::nil(),
                role: Role::User,
                message_type: MessageType::Text,
            }),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        };

        let json = serde_json::to_value(&update).expect("serialize");
        assert_eq!(json["context_id"], json!(Uuid::nil()));
        assert_eq!(json["current_state"], json!("processing_user_message"));

        let message_update = json["message_update"].as_object().expect("message update");
        assert_eq!(message_update["type"], json!("created"));
        assert_eq!(message_update["role"], json!("User"));
    }

    #[test]
    fn context_update_omits_empty_metadata_when_serialized() {
        let update = ContextUpdate {
            context_id: Uuid::nil(),
            current_state: ContextState::Idle,
            previous_state: None,
            message_update: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        };

        let json = serde_json::to_value(&update).expect("serialize");
        assert!(json.get("metadata").is_none());
        assert!(json.get("message_update").is_none());
    }

    #[test]
    fn completed_message_update_round_trips() {
        let final_message = InternalMessage {
            role: Role::Assistant,
            content: vec![ContentPart::text("hello world")],
            message_type: MessageType::Text,
            ..Default::default()
        };

        let update = MessageUpdate::Completed {
            message_id: Uuid::new_v4(),
            final_message: final_message.clone(),
        };

        let serialized = serde_json::to_string(&update).expect("serialize");
        let deserialized: MessageUpdate = serde_json::from_str(&serialized).expect("deserialize");

        match deserialized {
            MessageUpdate::Completed {
                message_id: _,
                final_message: message,
            } => {
                assert_eq!(message.role, Role::Assistant);
                assert_eq!(message.content.len(), 1);
            }
            other => panic!("unexpected variant: {:?}", other),
        }
    }
}
