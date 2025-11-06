//! Tests for branch management

use context_manager::{Branch, ChatContext, ContentPart, InternalMessage, Role};
use uuid::Uuid;

#[test]
fn test_branch_creation() {
    let branch = Branch::new("test_branch".to_string());

    assert_eq!(branch.name, "test_branch");
    assert!(branch.message_ids.is_empty());
    assert!(branch.system_prompt.is_none());
    assert!(branch.user_prompt.is_none());
}

#[test]
fn test_context_add_message_to_branch() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Hello")],
        ..Default::default()
    };

    let _ = context.add_message_to_branch("main", message.clone());

    // Verify the branch now has one message
    let branch = context.branches.get("main").unwrap();
    assert_eq!(branch.message_ids.len(), 1);

    // Verify the message is in the pool
    assert_eq!(context.message_pool.len(), 1);
}

#[test]
fn test_context_get_active_branch() {
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let active_branch = context.get_active_branch();
    assert!(active_branch.is_some());
    assert_eq!(active_branch.unwrap().name, "main");
}

#[test]
fn test_multiple_branches_independent() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    // Add a new branch
    let branch2 = Branch::new("branch2".to_string());
    context.branches.insert("branch2".to_string(), branch2);

    // Add messages to both branches
    let msg1 = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Message 1")],
        ..Default::default()
    };
    let msg2 = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Message 2")],
        ..Default::default()
    };

    let _ = context.add_message_to_branch("main", msg1);
    let _ = context.add_message_to_branch("branch2", msg2);

    // Verify both branches have their own messages
    assert_eq!(context.branches.get("main").unwrap().message_ids.len(), 1);
    assert_eq!(
        context.branches.get("branch2").unwrap().message_ids.len(),
        1
    );

    // Verify total message pool has both
    assert_eq!(context.message_pool.len(), 2);
}
