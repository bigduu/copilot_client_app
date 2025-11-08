//! Tests for ChatContext lifecycle methods (streaming, state transitions, etc.)
//!
//! This module tests the high-level lifecycle methods that manage state transitions
//! and ContextUpdate generation for the LLM request/response cycle.

use context_manager::{ChatContext, ContextState, MessageType, MessageUpdate, Role};
use uuid::Uuid;

// ============================================================================
// Tests for transition_to_awaiting_llm()
// ============================================================================

#[test]
fn test_transition_to_awaiting_llm_from_processing_user_message() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    // Setup: Start in ProcessingUserMessage state
    context.current_state = ContextState::ProcessingUserMessage;

    // Action: Transition to AwaitingLLMResponse
    let updates = context.transition_to_awaiting_llm();

    // Assert: Should produce one update
    assert_eq!(updates.len(), 1, "Should produce exactly one update");

    // Assert: Update should contain state transition
    let update = &updates[0];
    assert_eq!(update.current_state, ContextState::AwaitingLLMResponse);
    assert_eq!(
        update.previous_state,
        Some(ContextState::ProcessingUserMessage)
    );
    assert!(update.message_update.is_none());

    // Assert: Context state should be updated
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);
}

#[test]
fn test_transition_to_awaiting_llm_from_processing_tool_results() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingToolResults;

    let updates = context.transition_to_awaiting_llm();

    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].current_state, ContextState::AwaitingLLMResponse);
    assert_eq!(
        updates[0].previous_state,
        Some(ContextState::ProcessingToolResults)
    );
}

#[test]
fn test_transition_to_awaiting_llm_from_generating_response() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::GeneratingResponse;

    let updates = context.transition_to_awaiting_llm();

    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].current_state, ContextState::AwaitingLLMResponse);
}

#[test]
fn test_transition_to_awaiting_llm_from_tool_auto_loop() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ToolAutoLoop {
        depth: 2,
        tools_executed: 5,
    };

    let updates = context.transition_to_awaiting_llm();

    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].current_state, ContextState::AwaitingLLMResponse);
}

#[test]
fn test_transition_to_awaiting_llm_from_invalid_state_no_op() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    // Try to transition from Idle (invalid)
    context.current_state = ContextState::Idle;
    let initial_state = context.current_state.clone();

    let updates = context.transition_to_awaiting_llm();

    // Should produce no updates
    assert_eq!(
        updates.len(),
        0,
        "Should not produce updates from invalid state"
    );

    // State should remain unchanged
    assert_eq!(context.current_state, initial_state);
}

#[test]
fn test_transition_to_awaiting_llm_idempotent() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;

    // Trying to transition when already in AwaitingLLMResponse should be no-op
    let updates = context.transition_to_awaiting_llm();

    assert_eq!(updates.len(), 0);
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);
}

// ============================================================================
// Tests for handle_llm_error()
// ============================================================================

#[test]
fn test_handle_llm_error_from_awaiting_llm_response() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let error_msg = "Connection timeout".to_string();

    let updates = context.handle_llm_error(error_msg.clone());

    assert_eq!(updates.len(), 1);

    let update = &updates[0];
    // Check the update contains Failed state
    if let ContextState::Failed { error_message, .. } = &update.current_state {
        assert_eq!(error_message, &error_msg);
    } else {
        panic!("Expected Failed state in update");
    }
    assert_eq!(
        update.previous_state,
        Some(ContextState::AwaitingLLMResponse)
    );
    assert!(update.message_update.is_none());

    // Context should be in Failed state
    if let ContextState::Failed { error_message, .. } = &context.current_state {
        assert_eq!(error_message, &error_msg);
    } else {
        panic!("Expected Failed state");
    }
}

#[test]
fn test_handle_llm_error_from_streaming() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::StreamingLLMResponse;
    let error_msg = "Stream interrupted".to_string();

    let updates = context.handle_llm_error(error_msg.clone());

    assert_eq!(updates.len(), 1);
    // Check state is Failed with correct error message
    if let ContextState::Failed { error_message, .. } = &context.current_state {
        assert_eq!(error_message, &error_msg);
    } else {
        panic!("Expected Failed state");
    }
    assert_eq!(
        updates[0].previous_state,
        Some(ContextState::StreamingLLMResponse)
    );
}

#[test]
fn test_handle_llm_error_preserves_error_message() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingUserMessage;
    let detailed_error = "LLM API error. Status: 500 Body: Internal Server Error".to_string();

    let updates = context.handle_llm_error(detailed_error.clone());

    match &context.current_state {
        ContextState::Failed { error_message, .. } => {
            let error = error_message;
            assert_eq!(error, &detailed_error);
        }
        other => panic!("Expected Failed state, got {:?}", other),
    }

    match &updates[0].current_state {
        ContextState::Failed { error_message, .. } => {
            let error = error_message;
            assert_eq!(error, &detailed_error);
        }
        other => panic!("Update should contain Failed state, got {:?}", other),
    }
}

// ============================================================================
// Tests for begin_streaming_response()
// ============================================================================

#[test]
fn test_begin_streaming_response_transitions_state() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;

    let (message_id, updates) = context.begin_streaming_response();

    // Should produce 2 updates: state transition + message created
    assert_eq!(
        updates.len(),
        2,
        "Should produce state update and message update"
    );

    // First update: state transition
    let state_update = &updates[0];
    assert_eq!(
        state_update.current_state,
        ContextState::StreamingLLMResponse
    );
    assert_eq!(
        state_update.previous_state,
        Some(ContextState::AwaitingLLMResponse)
    );
    assert!(state_update.message_update.is_none());

    // Second update: message created
    let message_update = &updates[1];
    assert_eq!(
        message_update.current_state,
        ContextState::StreamingLLMResponse
    );
    match &message_update.message_update {
        Some(MessageUpdate::Created {
            message_id: created_id,
            role,
            message_type,
        }) => {
            assert_eq!(created_id, &message_id);
            assert_eq!(role, &Role::Assistant);
            assert_eq!(message_type, &MessageType::Text);
        }
        other => panic!("Expected Created update, got {:?}", other),
    }

    // Context state should be updated
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);

    // Message should exist in pool
    assert!(context.message_pool.contains_key(&message_id));

    // Sequence should be initialized
    assert_eq!(context.stream_sequences.get(&message_id), Some(&0));
}

#[test]
fn test_begin_streaming_response_creates_empty_assistant_message() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;

    let (message_id, _) = context.begin_streaming_response();

    let node = context
        .message_pool
        .get(&message_id)
        .expect("Message should exist");
    assert_eq!(node.message.role, Role::Assistant);
    assert_eq!(node.message.message_type, MessageType::Text);

    // Content should be empty initially
    let content = node
        .message
        .content
        .first()
        .expect("Should have content part");
    assert_eq!(content.text_content(), Some(""));
}

// ============================================================================
// Tests for apply_streaming_delta()
// ============================================================================

#[test]
fn test_apply_streaming_delta_appends_text() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let (message_id, _) = context.begin_streaming_response();

    // Apply first delta
    let result1 = context.apply_streaming_delta(message_id, "Hello");
    assert!(result1.is_some());
    let (update1, seq1) = result1.unwrap();
    assert_eq!(seq1, 1);

    match &update1.message_update {
        Some(MessageUpdate::ContentDelta {
            message_id: mid,
            delta,
            accumulated,
        }) => {
            assert_eq!(mid, &message_id);
            assert_eq!(delta, "Hello");
            assert_eq!(accumulated, "Hello");
        }
        other => panic!("Expected ContentDelta, got {:?}", other),
    }

    // Apply second delta
    let result2 = context.apply_streaming_delta(message_id, " world");
    assert!(result2.is_some());
    let (update2, seq2) = result2.unwrap();
    assert_eq!(seq2, 2);

    match &update2.message_update {
        Some(MessageUpdate::ContentDelta {
            delta, accumulated, ..
        }) => {
            assert_eq!(delta, " world");
            assert_eq!(accumulated, "Hello world");
        }
        other => panic!("Expected ContentDelta, got {:?}", other),
    }

    // Verify final content in message pool
    let node = context.message_pool.get(&message_id).unwrap();
    let content = node.message.content.first().unwrap();
    assert_eq!(content.text_content(), Some("Hello world"));
}

#[test]
fn test_apply_streaming_delta_empty_string_returns_none() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let (message_id, _) = context.begin_streaming_response();

    let result = context.apply_streaming_delta(message_id, "");
    assert!(result.is_none(), "Empty delta should return None");
}

#[test]
fn test_apply_streaming_delta_nonexistent_message_returns_none() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let fake_id = Uuid::new_v4();
    let result = context.apply_streaming_delta(fake_id, "some text");
    assert!(result.is_none(), "Non-existent message should return None");
}

#[test]
fn test_apply_streaming_delta_increments_sequence() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let (message_id, _) = context.begin_streaming_response();

    let sequences: Vec<u64> = (1..=5)
        .map(|i| {
            let (_, seq) = context
                .apply_streaming_delta(message_id, format!("chunk{}", i))
                .unwrap();
            seq
        })
        .collect();

    assert_eq!(sequences, vec![1, 2, 3, 4, 5]);
}

// ============================================================================
// Tests for finish_streaming_response()
// ============================================================================

#[test]
fn test_finish_streaming_response_transitions_to_idle() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let (message_id, _) = context.begin_streaming_response();
    context.apply_streaming_delta(message_id, "Complete message");

    let updates = context.finish_streaming_response(message_id);

    // Should produce 2 updates: Completed + transition to Idle
    assert_eq!(updates.len(), 2);

    // First update: message completed
    let completed_update = &updates[0];
    assert_eq!(
        completed_update.current_state,
        ContextState::ProcessingLLMResponse
    );
    match &completed_update.message_update {
        Some(MessageUpdate::Completed {
            message_id: mid,
            final_message,
        }) => {
            assert_eq!(mid, &message_id);
            assert_eq!(final_message.role, Role::Assistant);
            assert_eq!(final_message.message_type, MessageType::Text);
        }
        other => panic!("Expected Completed update, got {:?}", other),
    }

    // Second update: transition to Idle
    let idle_update = &updates[1];
    assert_eq!(idle_update.current_state, ContextState::Idle);
    assert_eq!(
        idle_update.previous_state,
        Some(ContextState::ProcessingLLMResponse)
    );
    assert!(idle_update.message_update.is_none());

    // Context should be in Idle state
    assert_eq!(context.current_state, ContextState::Idle);
}

#[test]
fn test_finish_streaming_response_preserves_message_content() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let (message_id, _) = context.begin_streaming_response();

    let expected_content = "This is a complete response.";
    context.apply_streaming_delta(message_id, expected_content);

    let updates = context.finish_streaming_response(message_id);

    match &updates[0].message_update {
        Some(MessageUpdate::Completed { final_message, .. }) => {
            let content = final_message.content.first().unwrap();
            assert_eq!(content.text_content(), Some(expected_content));
        }
        other => panic!("Expected Completed update, got {:?}", other),
    }
}

// ============================================================================
// Integration Tests: Complete Lifecycle Flows
// ============================================================================

#[test]
fn test_complete_streaming_lifecycle_success_flow() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    // Step 1: Start from ProcessingUserMessage
    context.current_state = ContextState::ProcessingUserMessage;

    // Step 2: Transition to AwaitingLLMResponse
    let updates_1 = context.transition_to_awaiting_llm();
    assert_eq!(updates_1.len(), 1);
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);

    // Step 3: Begin streaming
    let (message_id, updates_2) = context.begin_streaming_response();
    assert_eq!(updates_2.len(), 2); // state + message created
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);

    // Step 4: Stream multiple chunks
    let chunks = vec!["Hello", ", ", "world", "!"];
    let mut delta_updates = Vec::new();
    for chunk in chunks {
        if let Some((update, _)) = context.apply_streaming_delta(message_id, chunk) {
            delta_updates.push(update);
        }
    }
    assert_eq!(delta_updates.len(), 4);

    // Verify accumulated content
    let node = context.message_pool.get(&message_id).unwrap();
    let content = node.message.content.first().unwrap();
    assert_eq!(content.text_content(), Some("Hello, world!"));

    // Step 5: Finish streaming
    let updates_3 = context.finish_streaming_response(message_id);
    assert_eq!(updates_3.len(), 2); // completed + idle
    assert_eq!(context.current_state, ContextState::Idle);

    // Total updates: 1 + 2 + 4 + 2 = 9
    assert_eq!(
        updates_1.len() + updates_2.len() + delta_updates.len() + updates_3.len(),
        9
    );
}

#[test]
fn test_streaming_lifecycle_with_error() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingUserMessage;

    // Transition to awaiting
    context.transition_to_awaiting_llm();

    // Begin streaming
    let (message_id, _) = context.begin_streaming_response();
    context.apply_streaming_delta(message_id, "Partial response");

    // Error occurs during streaming
    let error_updates = context.handle_llm_error("Network error".to_string());
    assert_eq!(error_updates.len(), 1);
    assert!(matches!(context.current_state, ContextState::Failed { .. }));
}

#[test]
fn test_error_before_streaming_starts() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingUserMessage;
    context.transition_to_awaiting_llm();
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);

    // Error before streaming begins
    context.handle_llm_error("Connection failed".to_string());

    assert!(matches!(context.current_state, ContextState::Failed { .. }));
}

#[test]
fn test_multiple_streaming_sessions_independent() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    // First streaming session
    context.current_state = ContextState::AwaitingLLMResponse;
    let (msg_id_1, _) = context.begin_streaming_response();
    context.apply_streaming_delta(msg_id_1, "First message");
    context.finish_streaming_response(msg_id_1);

    // Second streaming session
    context.current_state = ContextState::ProcessingUserMessage;
    context.transition_to_awaiting_llm();
    let (msg_id_2, _) = context.begin_streaming_response();
    context.apply_streaming_delta(msg_id_2, "Second message");
    context.finish_streaming_response(msg_id_2);

    // Both messages should exist
    assert!(context.message_pool.contains_key(&msg_id_1));
    assert!(context.message_pool.contains_key(&msg_id_2));

    let content_1 = context
        .message_pool
        .get(&msg_id_1)
        .unwrap()
        .message
        .content
        .first()
        .unwrap()
        .text_content();
    let content_2 = context
        .message_pool
        .get(&msg_id_2)
        .unwrap()
        .message
        .content
        .first()
        .unwrap()
        .text_content();

    assert_eq!(content_1, Some("First message"));
    assert_eq!(content_2, Some("Second message"));
}

// ============================================================================
// Tests for sequence tracking
// ============================================================================

#[test]
fn test_sequence_tracking_across_lifecycle() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::AwaitingLLMResponse;
    let (message_id, _) = context.begin_streaming_response();

    // Sequence should start at 0
    assert_eq!(context.stream_sequences.get(&message_id), Some(&0));

    // Apply deltas and track sequences
    let (_, seq1) = context.apply_streaming_delta(message_id, "a").unwrap();
    assert_eq!(seq1, 1);

    let (_, seq2) = context.apply_streaming_delta(message_id, "b").unwrap();
    assert_eq!(seq2, 2);

    let (_, seq3) = context.apply_streaming_delta(message_id, "c").unwrap();
    assert_eq!(seq3, 3);

    // Sequence should be at 3
    assert_eq!(context.stream_sequences.get(&message_id), Some(&3));
}

#[test]
fn test_ensure_sequence_at_least() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let message_id = Uuid::new_v4();

    // First call should set sequence to minimum
    let seq = context.ensure_sequence_at_least(message_id, 5);
    assert_eq!(seq, 5);
    assert_eq!(context.stream_sequences.get(&message_id), Some(&5));

    // Second call with lower value should not decrease
    let seq = context.ensure_sequence_at_least(message_id, 3);
    assert_eq!(seq, 5);

    // Third call with higher value should increase
    let seq = context.ensure_sequence_at_least(message_id, 10);
    assert_eq!(seq, 10);
}
