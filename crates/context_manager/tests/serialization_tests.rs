//! Tests for serialization

use context_manager::{ChatContext, ContentPart, ContextState, InternalMessage, Role};
use serde_json;
use uuid::Uuid;

#[test]
fn test_context_json_serialization() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingUserMessage;

    let json = serde_json::to_string(&context).unwrap();
    assert!(!json.is_empty());
}

#[test]
fn test_context_json_deserialization() {
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let json = serde_json::to_string(&context).unwrap();
    let deserialized: ChatContext = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.config.model_id, context.config.model_id);
    assert_eq!(deserialized.config.mode, context.config.mode);
    assert_eq!(deserialized.current_state, context.current_state);
}

#[test]
fn test_context_round_trip_serialization() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    // Add a message with simple content
    context.current_state = ContextState::ProcessingUserMessage;
    context
        .config
        .parameters
        .insert("key".to_string(), serde_json::json!("value"));

    // Serialize and deserialize basic structure
    let json = serde_json::to_string(&context).unwrap();
    let deserialized: ChatContext = serde_json::from_str(&json).unwrap();

    // Verify structure is preserved
    assert_eq!(deserialized.branches.len(), context.branches.len());
    assert_eq!(deserialized.message_pool.len(), context.message_pool.len());
    assert_eq!(deserialized.current_state, context.current_state);
}

#[test]
fn test_state_serialization() {
    let states = vec![
        ContextState::Idle,
        ContextState::ProcessingUserMessage,
        ContextState::AwaitingLLMResponse,
        ContextState::Failed {
            error: "Test".to_string(),
        },
        ContextState::TransientFailure {
            error: "Retry".to_string(),
            retry_count: 1,
        },
    ];

    for state in states {
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: ContextState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, state);
    }
}

#[test]
fn test_default_state_serialization() {
    let state = ContextState::default();
    assert_eq!(state, ContextState::Idle);

    let json = serde_json::to_string(&state).unwrap();
    let deserialized: ContextState = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized, ContextState::Idle);
}
