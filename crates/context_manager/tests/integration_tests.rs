//! Integration tests for complete conversation flows
//!
//! These tests verify end-to-end scenarios including:
//! - Complete user message → LLM response cycle
//! - Multiple message exchanges
//! - Tool call workflows
//! - Error recovery
//! - Branch operations

use context_manager::{
    ChatContext, ChatEvent, ContentPart, ContextState, InternalMessage, MessageMetadata,
    MessageType, Role,
};
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// Helper functions for test setup
// ============================================================================

fn create_test_context() -> ChatContext {
    ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string())
}

fn add_user_message(context: &mut ChatContext, content: &str) -> Uuid {
    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text_owned(content.to_string())],
        message_type: MessageType::Text,
        ..Default::default()
    };
    context.add_message_to_branch(&context.active_branch_name.clone(), message)
}

fn add_assistant_message(context: &mut ChatContext, content: &str) -> Uuid {
    let message = InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text_owned(content.to_string())],
        message_type: MessageType::Text,
        ..Default::default()
    };
    context.add_message_to_branch(&context.active_branch_name.clone(), message)
}

// ============================================================================
// Integration Tests: Complete Message Cycles
// ============================================================================

#[test]
fn test_complete_user_assistant_cycle() {
    let mut context = create_test_context();

    // Verify initial state
    assert_eq!(context.current_state, ContextState::Idle);
    assert_eq!(context.get_active_branch().unwrap().message_ids.len(), 0);

    // Step 1: User sends message
    context.handle_event(ChatEvent::UserMessageSent);
    assert_eq!(context.current_state, ContextState::ProcessingUserMessage);

    let user_msg_id = add_user_message(&mut context, "What is Rust?");
    assert_eq!(context.get_active_branch().unwrap().message_ids.len(), 1);

    // Step 2: Prepare LLM request
    let updates = context.transition_to_awaiting_llm();
    assert_eq!(updates.len(), 1);
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);

    // Step 3: Simulate LLM streaming response using NEW API
    let assistant_msg_id = context.begin_streaming_llm_response(None);
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);

    // Simulate streaming chunks using NEW API
    let response_text = "Rust is a systems programming language.";
    for chunk in response_text.split_whitespace() {
        context.append_streaming_chunk(assistant_msg_id, format!("{} ", chunk));
    }

    // Step 4: Complete streaming using NEW API
    context.finalize_streaming_response(assistant_msg_id, Some("stop".to_string()), None);
    assert_eq!(context.current_state, ContextState::Idle);

    // Verify final state
    let branch = context.get_active_branch().unwrap();
    assert_eq!(branch.message_ids.len(), 2);
    assert_eq!(branch.message_ids[0], user_msg_id);
    assert_eq!(branch.message_ids[1], assistant_msg_id);

    // Verify message contents
    let user_node = context.message_pool.get(&user_msg_id).unwrap();
    assert_eq!(
        user_node
            .message
            .content
            .first()
            .unwrap()
            .text_content()
            .unwrap(),
        "What is Rust?"
    );

    let assistant_node = context.message_pool.get(&assistant_msg_id).unwrap();
    let assistant_content = assistant_node
        .message
        .content
        .first()
        .unwrap()
        .text_content()
        .unwrap();
    assert!(assistant_content.contains("Rust"));
    assert!(assistant_content.contains("programming"));
}

#[test]
fn test_multiple_conversation_turns() {
    let mut context = create_test_context();

    // Turn 1
    context.handle_event(ChatEvent::UserMessageSent);
    let _user_msg_1 = add_user_message(&mut context, "Hello");
    context.transition_to_awaiting_llm();
    let asst_msg_1 = context.begin_streaming_llm_response(None);
    context.append_streaming_chunk(asst_msg_1, "Hi there!".to_string());
    context.finalize_streaming_response(asst_msg_1, Some("stop".to_string()), None);

    // Turn 2
    context.handle_event(ChatEvent::UserMessageSent);
    let _user_msg_2 = add_user_message(&mut context, "How are you?");
    context.transition_to_awaiting_llm();
    let asst_msg_2 = context.begin_streaming_llm_response(None);
    context.append_streaming_chunk(asst_msg_2, "I'm doing well, thanks!".to_string());
    context.finalize_streaming_response(asst_msg_2, Some("stop".to_string()), None);

    // Turn 3
    context.handle_event(ChatEvent::UserMessageSent);
    let _user_msg_3 = add_user_message(&mut context, "Goodbye");
    context.transition_to_awaiting_llm();
    let asst_msg_3 = context.begin_streaming_llm_response(None);
    context.append_streaming_chunk(asst_msg_3, "Goodbye! Have a great day!".to_string());
    context.finalize_streaming_response(asst_msg_3, Some("stop".to_string()), None);

    // Verify: should have 6 messages (3 user + 3 assistant)
    let branch = context.get_active_branch().unwrap();
    assert_eq!(branch.message_ids.len(), 6);
    assert_eq!(context.current_state, ContextState::Idle);

    // Verify alternating pattern: User, Assistant, User, Assistant, ...
    let message_ids = &branch.message_ids;
    for (i, msg_id) in message_ids.iter().enumerate() {
        let node = context.message_pool.get(msg_id).unwrap();
        let expected_role = if i % 2 == 0 {
            Role::User
        } else {
            Role::Assistant
        };
        assert_eq!(node.message.role, expected_role);
    }
}

#[test]
fn test_conversation_with_empty_responses() {
    let mut context = create_test_context();

    context.handle_event(ChatEvent::UserMessageSent);
    let _user_msg = add_user_message(&mut context, "Test");

    context.transition_to_awaiting_llm();
    let asst_msg = context.begin_streaming_llm_response(None);

    // Don't add any content (empty response)

    context.finalize_streaming_response(asst_msg, Some("stop".to_string()), None);

    // Should still work and return to Idle
    assert_eq!(context.current_state, ContextState::Idle);

    let assistant_node = context.message_pool.get(&asst_msg).unwrap();
    let content = assistant_node
        .message
        .content
        .first()
        .unwrap()
        .text_content()
        .unwrap();
    assert_eq!(content, "");
}

// ============================================================================
// Integration Tests: Error Handling
// ============================================================================

#[test]
fn test_error_recovery_after_llm_failure() {
    let mut context = create_test_context();

    // Start normal flow
    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Test question");
    context.transition_to_awaiting_llm();

    // Simulate LLM error
    context.handle_llm_error("Connection timeout".to_string());
    assert!(matches!(context.current_state, ContextState::Failed { .. }));

    // User can retry by creating a new message
    // Reset to idle manually (in real scenario, this would be a user action)
    context.current_state = ContextState::Idle;

    // Retry the same flow
    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Retry: Test question");
    context.transition_to_awaiting_llm();
    let msg_id = context.begin_streaming_llm_response(None);
    context.append_streaming_chunk(msg_id, "Success on retry".to_string());
    context.finalize_streaming_response(msg_id, Some("stop".to_string()), None);

    assert_eq!(context.current_state, ContextState::Idle);
}

#[test]
fn test_error_during_streaming() {
    let mut context = create_test_context();

    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Tell me a story");

    context.transition_to_awaiting_llm();
    let msg_id = context.begin_streaming_llm_response(None);

    // Receive some chunks
    context.append_streaming_chunk(msg_id, "Once upon a time".to_string());
    context.append_streaming_chunk(msg_id, ", there was".to_string());

    // Error occurs mid-stream
    context.handle_llm_error("Stream interrupted".to_string());

    assert!(matches!(context.current_state, ContextState::Failed { .. }));

    // Partial message should still be in message pool
    let node = context.message_pool.get(&msg_id).unwrap();
    let content = node
        .message
        .content
        .first()
        .unwrap()
        .text_content()
        .unwrap();
    assert_eq!(content, "Once upon a time, there was");
}

// ============================================================================
// Integration Tests: Tool Call Workflows
// ============================================================================

#[test]
fn test_tool_call_approval_workflow() {
    let mut context = create_test_context();

    // Start from ProcessingLLMResponse state (after LLM returned with tool calls)
    context.current_state = ContextState::ProcessingLLMResponse;

    // Detect tool calls and request approval
    let request_id = Uuid::new_v4();
    context.handle_event(ChatEvent::ToolApprovalRequested {
        request_id,
        tool_name: "read_file".to_string(),
    });

    // Should now be in AwaitingToolApproval state
    match &context.current_state {
        ContextState::AwaitingToolApproval {
            pending_requests,
            tool_names,
        } => {
            assert_eq!(pending_requests, &vec![request_id]);
            assert_eq!(tool_names, &vec!["read_file".to_string()]);
        }
        other => panic!("Expected AwaitingToolApproval, got {:?}", other),
    }

    // Approve tool call
    context.handle_event(ChatEvent::ToolExecutionStarted {
        tool_name: "read_file".to_string(),
        attempt: 1,
        request_id: Some(request_id),
    });

    assert_eq!(
        context.current_state,
        ContextState::ExecutingTool {
            tool_name: "read_file".to_string(),
            attempt: 1,
        }
    );

    // Tool completes
    context.handle_event(ChatEvent::ToolExecutionCompleted);
    assert_eq!(context.current_state, ContextState::ProcessingToolResults);

    // Process results and return to generating response
    context.handle_event(ChatEvent::LLMRequestInitiated);
    assert_eq!(context.current_state, ContextState::GeneratingResponse);
}

#[test]
fn test_tool_call_denial_workflow() {
    let mut context = create_test_context();

    // Setup: reach AwaitingToolApproval state
    context.current_state = ContextState::AwaitingToolApproval {
        pending_requests: vec![Uuid::new_v4()],
        tool_names: vec!["dangerous_operation".to_string()],
    };

    // User denies tool call
    context.handle_event(ChatEvent::ToolCallsDenied);

    assert_eq!(context.current_state, ContextState::GeneratingResponse);

    // System should generate a response explaining denial
    // (In real scenario, this would be handled by the service layer)
}

#[test]
fn test_tool_auto_loop_workflow() {
    let mut context = create_test_context();

    // Start from ProcessingToolResults (typical entry point for auto-loop)
    context.current_state = ContextState::ProcessingToolResults;

    // Enter auto-loop
    context.handle_event(ChatEvent::ToolAutoLoopStarted {
        depth: 1,
        tools_executed: 1,
    });
    assert_eq!(
        context.current_state,
        ContextState::ToolAutoLoop {
            depth: 1,
            tools_executed: 1,
        }
    );

    // Update progress in auto-loop
    context.handle_event(ChatEvent::ToolAutoLoopProgress {
        depth: 1,
        tools_executed: 2,
    });
    assert_eq!(
        context.current_state,
        ContextState::ToolAutoLoop {
            depth: 1,
            tools_executed: 2,
        }
    );

    // Finish auto-loop
    context.handle_event(ChatEvent::ToolAutoLoopFinished);
    assert_eq!(context.current_state, ContextState::GeneratingResponse);

    // Can now initiate LLM request
    context.handle_event(ChatEvent::LLMRequestInitiated);
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);
}

// ============================================================================
// Integration Tests: Branch Operations
// ============================================================================

#[test]
fn test_basic_branch_structure() {
    let mut context = create_test_context();

    // Add messages to main branch
    let msg1 = add_user_message(&mut context, "Message 1");
    let msg2 = add_assistant_message(&mut context, "Response 1");

    // Verify branch structure
    assert_eq!(context.active_branch_name, "main");
    let main_branch = context.get_active_branch().unwrap();
    assert_eq!(main_branch.message_ids.len(), 2);
    assert_eq!(main_branch.message_ids[0], msg1);
    assert_eq!(main_branch.message_ids[1], msg2);

    // All messages should be in message pool
    assert!(context.message_pool.contains_key(&msg1));
    assert!(context.message_pool.contains_key(&msg2));
}

#[test]
fn test_multiple_branches_exist() {
    let context = create_test_context();

    // Initially should have main branch
    assert!(context.branches.contains_key("main"));
    assert_eq!(context.branches.len(), 1);
}

// ============================================================================
// Integration Tests: Message Metadata
// ============================================================================

#[test]
fn test_messages_preserve_metadata() {
    let mut context = create_test_context();

    // Create message with metadata
    let mut extra = HashMap::new();
    extra.insert("source".to_string(), serde_json::json!("test"));
    extra.insert("priority".to_string(), serde_json::json!("high"));

    let metadata = MessageMetadata {
        extra: Some(extra.clone()),
        ..Default::default()
    };

    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text_owned("Test with metadata".to_string())],
        message_type: MessageType::Text,
        metadata: Some(metadata),
        ..Default::default()
    };

    let msg_id = context.add_message_to_branch(&context.active_branch_name.clone(), message);

    // Verify metadata is preserved
    let node = context.message_pool.get(&msg_id).unwrap();
    assert!(node.message.metadata.is_some());

    let preserved_meta = node.message.metadata.as_ref().unwrap();
    assert!(preserved_meta.extra.is_some());

    let preserved_extra = preserved_meta.extra.as_ref().unwrap();
    assert_eq!(
        preserved_extra.get("source"),
        Some(&serde_json::json!("test"))
    );
    assert_eq!(
        preserved_extra.get("priority"),
        Some(&serde_json::json!("high"))
    );
}

// ============================================================================
// Integration Tests: Edge Cases
// ============================================================================

#[test]
fn test_context_dirty_flag_management() {
    let mut context = create_test_context();

    // Initially not dirty
    assert!(!context.is_dirty());

    // Adding message marks dirty
    add_user_message(&mut context, "Test");
    assert!(context.is_dirty());

    // Clear dirty flag
    context.clear_dirty();
    assert!(!context.is_dirty());

    // Adding another message should mark dirty again
    add_user_message(&mut context, "Another test");
    assert!(context.is_dirty());
}

#[test]
fn test_large_conversation_performance() {
    let mut context = create_test_context();

    // Add 100 message pairs
    for i in 0..100 {
        add_user_message(&mut context, &format!("User message {}", i));
        add_assistant_message(&mut context, &format!("Assistant response {}", i));
    }

    // Verify count
    let branch = context.get_active_branch().unwrap();
    assert_eq!(branch.message_ids.len(), 200);

    // Verify message pool size matches
    assert_eq!(context.message_pool.len(), 200);

    // Verify we can still access messages
    let last_msg_id = branch.message_ids.last().unwrap();
    let last_node = context.message_pool.get(last_msg_id).unwrap();
    assert!(
        last_node
            .message
            .content
            .first()
            .unwrap()
            .text_content()
            .unwrap()
            .contains("response 99")
    );
}

#[test]
fn test_context_serialization_deserialization() {
    let mut context = create_test_context();

    // Add some data
    add_user_message(&mut context, "Hello");
    add_assistant_message(&mut context, "Hi there!");

    // Serialize
    let serialized = serde_json::to_string(&context).expect("Should serialize");

    // Deserialize
    let deserialized: ChatContext = serde_json::from_str(&serialized).expect("Should deserialize");

    // Verify equality
    assert_eq!(deserialized.id, context.id);
    assert_eq!(deserialized.config.model_id, context.config.model_id);
    assert_eq!(
        deserialized.get_active_branch().unwrap().message_ids.len(),
        context.get_active_branch().unwrap().message_ids.len()
    );
    assert_eq!(deserialized.message_pool.len(), context.message_pool.len());
}
