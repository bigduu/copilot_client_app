//! Tests for ChatContext operations

use context_manager::{ChatContext, ContentPart, ContextState, InternalMessage, MessageNode, Role};
use uuid::Uuid;

#[test]
fn test_context_creation() {
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    assert_eq!(context.config.model_id, "gpt-4");
    assert_eq!(context.config.mode, "default");
    assert_eq!(context.active_branch_name, "main");
    assert_eq!(context.current_state, ContextState::Idle);
    assert!(context.branches.contains_key("main"));
}

#[test]
fn test_context_default_state() {
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    assert_eq!(context.current_state, ContextState::Idle);
}

#[test]
fn test_context_cloning() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingUserMessage;

    let cloned = context.clone();
    assert_eq!(cloned.current_state, context.current_state);
    assert_eq!(cloned.config.model_id, context.config.model_id);
}
