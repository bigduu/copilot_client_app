//! Tests for serialization

use context_manager::{ChatContext, ContextState};
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
            error_message: "Test".to_string(),
            failed_at: "2025-11-08T10:00:00Z".to_string(),
        },
        ContextState::TransientFailure {
            error_type: "Retry".to_string(),
            retry_count: 1,
            max_retries: 3,
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

#[test]
fn test_context_title_serialization() {
    // Test with title set
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    context.title = Some("Test Chat Title".to_string());
    context.auto_generate_title = false;

    let json = serde_json::to_string(&context).unwrap();
    let deserialized: ChatContext = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.title, Some("Test Chat Title".to_string()));
    assert_eq!(deserialized.auto_generate_title, false);

    // Test with title None (should not be serialized due to skip_serializing_if)
    let context_no_title =
        ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    let json_no_title = serde_json::to_string(&context_no_title).unwrap();

    // Verify title field is not in JSON when None
    assert!(!json_no_title.contains("\"title\""));

    // But auto_generate_title should default to true
    let deserialized_no_title: ChatContext = serde_json::from_str(&json_no_title).unwrap();
    assert_eq!(deserialized_no_title.title, None);
    assert_eq!(deserialized_no_title.auto_generate_title, true);
}

#[test]
fn test_context_auto_generate_title_default() {
    // Test that auto_generate_title defaults to true for new contexts
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    assert_eq!(context.auto_generate_title, true);
    assert_eq!(context.title, None);
}
