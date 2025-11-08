//! Tests for streaming response methods (Phase 1.5.3)

use context_manager::{
    ChatContext, RichMessageType, Role, MessageSource,
};
use uuid::Uuid;

#[test]
fn test_begin_streaming_llm_response() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());

    let message_id = context.begin_streaming_llm_response(Some("gpt-4".to_string()));

    // Verify message was created
    let node = context.message_pool.get(&message_id).expect("Message should exist");
    assert_eq!(node.message.role, Role::Assistant);

    // Verify it's a StreamingResponse
    assert!(matches!(
        node.message.rich_type,
        Some(RichMessageType::StreamingResponse(_))
    ));

    // Verify metadata
    let metadata = node.message.metadata.as_ref().expect("Metadata should exist");
    assert_eq!(metadata.source, Some(MessageSource::AIGenerated));
    assert!(metadata.created_at.is_some());

    // Verify state transition
    use context_manager::ContextState;
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);
}

#[test]
fn test_append_streaming_chunk() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());
    let message_id = context.begin_streaming_llm_response(Some("gpt-4".to_string()));

    // Append first chunk
    let seq1 = context
        .append_streaming_chunk(message_id, "Hello")
        .expect("Should return sequence");
    assert_eq!(seq1, 1);

    // Append second chunk
    let seq2 = context
        .append_streaming_chunk(message_id, " world")
        .expect("Should return sequence");
    assert_eq!(seq2, 2);

    // Verify content accumulation
    let node = context.message_pool.get(&message_id).unwrap();
    if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
        assert_eq!(streaming_msg.content, "Hello world");
        assert_eq!(streaming_msg.chunks.len(), 2);
        assert_eq!(streaming_msg.current_sequence(), 2);
    } else {
        panic!("Expected StreamingResponse");
    }

    // Verify legacy content field is updated
    assert_eq!(
        node.message.content.first().and_then(|c| c.text_content()),
        Some("Hello world")
    );
}

#[test]
fn test_append_chunk_empty_delta() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());
    let message_id = context.begin_streaming_llm_response(None);

    // Empty delta should return None
    let result = context.append_streaming_chunk(message_id, "");
    assert!(result.is_none());

    // Verify no chunks were added
    let sequence = context.get_streaming_sequence(message_id).unwrap();
    assert_eq!(sequence, 0);
}

#[test]
fn test_finalize_streaming_response() {
    use std::thread;
    use std::time::Duration;

    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());
    let message_id = context.begin_streaming_llm_response(Some("gpt-4".to_string()));

    // Append some chunks
    context.append_streaming_chunk(message_id, "Test");
    context.append_streaming_chunk(message_id, " message");

    // Wait a bit to ensure measurable duration
    thread::sleep(Duration::from_millis(10));

    // Finalize
    use context_manager::TokenUsage;
    let usage = TokenUsage {
        prompt_tokens: Some(10),
        completion_tokens: Some(5),
    };
    let success = context.finalize_streaming_response(
        message_id,
        Some("stop".to_string()),
        Some(usage.clone()),
    );
    assert!(success);

    // Verify StreamingResponseMsg was finalized
    let node = context.message_pool.get(&message_id).unwrap();
    if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
        assert!(streaming_msg.completed_at.is_some());
        assert!(streaming_msg.total_duration_ms.is_some());
        assert_eq!(streaming_msg.finish_reason, Some("stop".to_string()));
        assert_eq!(streaming_msg.usage, Some(usage.clone()));
    } else {
        panic!("Expected StreamingResponse");
    }

    // Verify metadata contains streaming statistics
    let metadata = node.message.metadata.as_ref().unwrap();
    assert!(metadata.streaming.is_some());
    let streaming_meta = metadata.streaming.as_ref().unwrap();
    assert_eq!(streaming_meta.chunks_count, 2);
    assert!(streaming_meta.completed_at.is_some());
    assert!(streaming_meta.total_duration_ms.is_some());

    // Verify token usage in metadata
    assert_eq!(metadata.tokens, Some(usage));

    // Verify state transition
    use context_manager::ContextState;
    assert_eq!(context.current_state, ContextState::ProcessingLLMResponse);
}

#[test]
fn test_get_streaming_sequence() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());
    let message_id = context.begin_streaming_llm_response(None);

    // Initially 0
    assert_eq!(context.get_streaming_sequence(message_id), Some(0));

    // After appending
    context.append_streaming_chunk(message_id, "A");
    assert_eq!(context.get_streaming_sequence(message_id), Some(1));

    context.append_streaming_chunk(message_id, "B");
    context.append_streaming_chunk(message_id, "C");
    assert_eq!(context.get_streaming_sequence(message_id), Some(3));

    // Non-existent message
    assert_eq!(context.get_streaming_sequence(Uuid::new_v4()), None);
}

#[test]
fn test_get_streaming_chunks_after() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());
    let message_id = context.begin_streaming_llm_response(None);

    // Append chunks
    context.append_streaming_chunk(message_id, "A");
    context.append_streaming_chunk(message_id, "B");
    context.append_streaming_chunk(message_id, "C");
    context.append_streaming_chunk(message_id, "D");

    // Get all chunks (after sequence 0)
    let chunks = context
        .get_streaming_chunks_after(message_id, 0)
        .unwrap();
    assert_eq!(chunks.len(), 4);
    assert_eq!(chunks[0], (1, "A".to_string()));
    assert_eq!(chunks[3], (4, "D".to_string()));

    // Get chunks after sequence 2
    let chunks = context
        .get_streaming_chunks_after(message_id, 2)
        .unwrap();
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0], (3, "C".to_string()));
    assert_eq!(chunks[1], (4, "D".to_string()));

    // Get chunks after last sequence (should be empty)
    let chunks = context
        .get_streaming_chunks_after(message_id, 4)
        .unwrap();
    assert_eq!(chunks.len(), 0);

    // Non-existent message
    assert!(context.get_streaming_chunks_after(Uuid::new_v4(), 0).is_none());
}

#[test]
fn test_streaming_integration_flow() {
    use std::thread;
    use std::time::Duration;

    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());

    // Full streaming flow
    let message_id = context.begin_streaming_llm_response(Some("gpt-4".to_string()));

    // Simulate streaming
    let chunks = vec!["The", " answer", " is", " 42"];
    for chunk in chunks {
        context.append_streaming_chunk(message_id, chunk);
        thread::sleep(Duration::from_millis(5)); // Simulate network delay
    }

    // Finalize
    let success = context.finalize_streaming_response(message_id, Some("stop".to_string()), None);
    assert!(success);

    // Verify final content
    let node = context.message_pool.get(&message_id).unwrap();
    if let Some(RichMessageType::StreamingResponse(streaming_msg)) = &node.message.rich_type {
        assert_eq!(streaming_msg.content, "The answer is 42");
        assert_eq!(streaming_msg.chunks.len(), 4);

        // Verify chunk intervals
        for (i, chunk) in streaming_msg.chunks.iter().enumerate() {
            if i > 0 {
                assert!(chunk.interval_ms.is_some());
            } else {
                assert!(chunk.interval_ms.is_none());
            }
        }
    } else {
        panic!("Expected StreamingResponse");
    }
}

#[test]
fn test_finalize_non_streaming_message() {
    use context_manager::{ContentPart, InternalMessage};

    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());

    // Create a regular message (not StreamingResponse)
    let message = InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text("Regular message")],
        ..Default::default()
    };
    let message_id = context.add_message_to_branch("main", message);

    // Try to finalize it (should fail)
    let success = context.finalize_streaming_response(message_id, None, None);
    assert!(!success);
}

#[test]
fn test_append_to_non_streaming_message() {
    use context_manager::{ContentPart, InternalMessage};

    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "test".to_string());

    // Create a regular message
    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("User message")],
        ..Default::default()
    };
    let message_id = context.add_message_to_branch("main", message);

    // Try to append chunk (should return None)
    let result = context.append_streaming_chunk(message_id, "Extra");
    assert!(result.is_none());
}

