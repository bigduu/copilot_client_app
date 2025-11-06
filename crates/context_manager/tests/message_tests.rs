//! Tests for message operations

use context_manager::{ChatContext, ContentPart, InternalMessage, MessageNode, Role};
use uuid::Uuid;

#[test]
fn test_message_node_creation() {
    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Test")],
        ..Default::default()
    };

    let node = MessageNode {
        id: Uuid::new_v4(),
        message: message.clone(),
        parent_id: None,
    };

    assert_eq!(node.message.role, Role::User);
    assert!(node.parent_id.is_none());
}

#[test]
fn test_message_with_parent() {
    let parent_id = Uuid::new_v4();

    let child_message = InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text("Response")],
        ..Default::default()
    };

    let child_node = MessageNode {
        id: Uuid::new_v4(),
        message: child_message,
        parent_id: Some(parent_id),
    };

    assert_eq!(child_node.parent_id, Some(parent_id));
}

#[test]
fn test_role_display() {
    assert_eq!(Role::System.to_string(), "system");
    assert_eq!(Role::User.to_string(), "user");
    assert_eq!(Role::Assistant.to_string(), "assistant");
    assert_eq!(Role::Tool.to_string(), "tool");
}

#[test]
fn test_content_part_text() {
    let part = ContentPart::text("Hello");
    assert_eq!(part.text_content(), Some("Hello"));
}

#[test]
fn test_context_retrieve_message_by_id() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Hello")],
        ..Default::default()
    };

    let _ = context.add_message_to_branch("main", message.clone());

    // Get the message ID from the branch
    let message_id = context.branches.get("main").unwrap().message_ids[0];

    // Retrieve the message from the pool
    let retrieved = context.message_pool.get(&message_id);
    assert!(retrieved.is_some());
    assert_eq!(
        retrieved.unwrap().message.content[0]
            .text_content()
            .unwrap(),
        "Hello"
    );
}

#[test]
fn test_message_with_tool_calls() {
    let message = InternalMessage {
        role: Role::Assistant,
        content: vec![],
        tool_calls: Some(vec![]),
        ..Default::default()
    };

    assert!(message.tool_calls.is_some());
}

#[test]
fn test_message_with_metadata() {
    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Test")],
        metadata: None,
        ..Default::default()
    };

    assert!(message.metadata.is_none());
}
