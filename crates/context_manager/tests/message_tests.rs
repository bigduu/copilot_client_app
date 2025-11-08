//! Tests for message operations

use context_manager::{ChatContext, ContentPart, InternalMessage, MessageNode, Role};
use context_manager::{MessageMetadata, MessageSource, DisplayHint, StreamingMetadata};
use context_manager::{StreamChunk, StreamingResponseMsg};
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

// Tests for new MessageMetadata fields (Phase 1.5.1)

#[test]
fn test_message_source_serialization() {
    let sources = vec![
        MessageSource::UserInput,
        MessageSource::UserFileReference,
        MessageSource::UserWorkflow,
        MessageSource::UserImageUpload,
        MessageSource::AIGenerated,
        MessageSource::ToolExecution,
        MessageSource::SystemControl,
    ];

    for source in sources {
        let json = serde_json::to_string(&source).unwrap();
        let deserialized: MessageSource = serde_json::from_str(&json).unwrap();
        assert_eq!(source, deserialized);
    }

    // Test snake_case naming
    let source = MessageSource::UserInput;
    let json = serde_json::to_string(&source).unwrap();
    assert_eq!(json, "\"user_input\"");
}

#[test]
fn test_display_hint_defaults() {
    let hint = DisplayHint::default();
    assert!(hint.summary.is_none());
    assert!(!hint.collapsed);
    assert!(hint.icon.is_none());

    let hint_with_data = DisplayHint {
        summary: Some("Summary text".to_string()),
        collapsed: true,
        icon: Some("file-icon".to_string()),
    };
    assert_eq!(hint_with_data.summary, Some("Summary text".to_string()));
    assert!(hint_with_data.collapsed);
    assert_eq!(hint_with_data.icon, Some("file-icon".to_string()));
}

#[test]
fn test_streaming_metadata_calculation() {
    use std::thread;
    use std::time::Duration;

    let mut streaming = StreamingMetadata::new();
    assert_eq!(streaming.chunks_count, 0);
    assert!(streaming.completed_at.is_none());
    assert!(streaming.total_duration_ms.is_none());
    assert!(streaming.average_chunk_interval_ms.is_none());

    // Simulate receiving chunks
    streaming.chunks_count = 5;
    thread::sleep(Duration::from_millis(50));
    streaming.finalize();

    assert!(streaming.completed_at.is_some());
    assert!(streaming.total_duration_ms.is_some());
    assert!(streaming.average_chunk_interval_ms.is_some());

    // Total duration should be at least 50ms
    let duration = streaming.total_duration_ms.unwrap();
    assert!(duration >= 50);

    // Average interval should be positive for 5 chunks
    let avg_interval = streaming.average_chunk_interval_ms.unwrap();
    assert!(avg_interval > 0.0);
}

#[test]
fn test_message_metadata_with_source() {
    let mut metadata = MessageMetadata::default();
    metadata.source = Some(MessageSource::AIGenerated);

    let message = InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text("Response")],
        metadata: Some(metadata.clone()),
        ..Default::default()
    };

    assert!(message.metadata.is_some());
    assert_eq!(message.metadata.unwrap().source, Some(MessageSource::AIGenerated));
}

#[test]
fn test_message_metadata_with_display_hint() {
    let mut metadata = MessageMetadata::default();
    metadata.display_hint = Some(DisplayHint {
        summary: Some("File loaded".to_string()),
        collapsed: true,
        icon: Some("document".to_string()),
    });

    let message = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text("Large file content...")],
        metadata: Some(metadata),
        ..Default::default()
    };

    let hint = message.metadata.as_ref().unwrap().display_hint.as_ref().unwrap();
    assert_eq!(hint.summary, Some("File loaded".to_string()));
    assert!(hint.collapsed);
}

#[test]
fn test_message_metadata_with_streaming_info() {
    let mut metadata = MessageMetadata::default();
    let mut streaming = StreamingMetadata::new();
    streaming.chunks_count = 10;
    streaming.finalize();
    
    metadata.streaming = Some(streaming);

    let message = InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text("Streamed response")],
        metadata: Some(metadata),
        ..Default::default()
    };

    let streaming_meta = message.metadata.as_ref().unwrap().streaming.as_ref().unwrap();
    assert_eq!(streaming_meta.chunks_count, 10);
    assert!(streaming_meta.completed_at.is_some());
}

#[test]
fn test_message_metadata_with_trace_id() {
    let mut metadata = MessageMetadata::default();
    metadata.trace_id = Some("trace-123-456".to_string());
    metadata.original_input = Some("Original user input".to_string());

    let json = serde_json::to_string(&metadata).unwrap();
    let deserialized: MessageMetadata = serde_json::from_str(&json).unwrap();
    
    assert_eq!(deserialized.trace_id, Some("trace-123-456".to_string()));
    assert_eq!(deserialized.original_input, Some("Original user input".to_string()));
}

// Tests for StreamingResponse (Phase 1.5.2)

#[test]
fn test_streaming_response_creation() {
    let streaming = StreamingResponseMsg::new(Some("gpt-4".to_string()));
    
    assert_eq!(streaming.content, "");
    assert_eq!(streaming.chunks.len(), 0);
    assert_eq!(streaming.model, Some("gpt-4".to_string()));
    assert!(streaming.completed_at.is_none());
    assert!(streaming.total_duration_ms.is_none());
    assert_eq!(streaming.current_sequence(), 0);
}

#[test]
fn test_append_chunk_sequence() {
    let mut streaming = StreamingResponseMsg::new(None);
    
    let seq1 = streaming.append_chunk("Hello".to_string());
    assert_eq!(seq1, 1);
    assert_eq!(streaming.content, "Hello");
    assert_eq!(streaming.chunks.len(), 1);
    assert_eq!(streaming.current_sequence(), 1);
    
    let seq2 = streaming.append_chunk(" world".to_string());
    assert_eq!(seq2, 2);
    assert_eq!(streaming.content, "Hello world");
    assert_eq!(streaming.chunks.len(), 2);
    assert_eq!(streaming.current_sequence(), 2);
    
    let seq3 = streaming.append_chunk("!".to_string());
    assert_eq!(seq3, 3);
    assert_eq!(streaming.content, "Hello world!");
    assert_eq!(streaming.chunks.len(), 3);
    assert_eq!(streaming.current_sequence(), 3);
}

#[test]
fn test_finalize_calculates_duration() {
    use std::thread;
    use std::time::Duration;
    
    let mut streaming = StreamingResponseMsg::new(Some("gpt-4".to_string()));
    streaming.append_chunk("Test".to_string());
    
    thread::sleep(Duration::from_millis(50));
    streaming.finalize(Some("stop".to_string()), None);
    
    assert!(streaming.completed_at.is_some());
    assert!(streaming.total_duration_ms.is_some());
    assert_eq!(streaming.finish_reason, Some("stop".to_string()));
    
    let duration = streaming.total_duration_ms.unwrap();
    assert!(duration >= 50, "Duration should be at least 50ms, got {}", duration);
}

#[test]
fn test_chunk_interval_calculation() {
    use std::thread;
    use std::time::Duration;
    
    let mut streaming = StreamingResponseMsg::new(None);
    
    streaming.append_chunk("First".to_string());
    thread::sleep(Duration::from_millis(20));
    streaming.append_chunk("Second".to_string());
    thread::sleep(Duration::from_millis(30));
    streaming.append_chunk("Third".to_string());
    
    assert_eq!(streaming.chunks.len(), 3);
    
    // First chunk has no interval
    assert!(streaming.chunks[0].interval_ms.is_none());
    
    // Second chunk should have interval >= 20ms
    assert!(streaming.chunks[1].interval_ms.is_some());
    let interval1 = streaming.chunks[1].interval_ms.unwrap();
    assert!(interval1 >= 20, "Interval should be at least 20ms, got {}", interval1);
    
    // Third chunk should have interval >= 30ms
    assert!(streaming.chunks[2].interval_ms.is_some());
    let interval2 = streaming.chunks[2].interval_ms.unwrap();
    assert!(interval2 >= 30, "Interval should be at least 30ms, got {}", interval2);
}

#[test]
fn test_stream_chunk_creation() {
    let chunk = StreamChunk::new(1, "Hello".to_string(), 5);
    
    assert_eq!(chunk.sequence, 1);
    assert_eq!(chunk.delta, "Hello");
    assert_eq!(chunk.accumulated_chars, 5);
    assert!(chunk.interval_ms.is_none());
}

#[test]
fn test_chunks_after() {
    let mut streaming = StreamingResponseMsg::new(None);
    
    streaming.append_chunk("A".to_string());
    streaming.append_chunk("B".to_string());
    streaming.append_chunk("C".to_string());
    streaming.append_chunk("D".to_string());
    
    // Get all chunks after sequence 0 (all chunks)
    let after_0 = streaming.chunks_after(0);
    assert_eq!(after_0.len(), 4);
    
    // Get chunks after sequence 2
    let after_2 = streaming.chunks_after(2);
    assert_eq!(after_2.len(), 2);
    assert_eq!(after_2[0].delta, "C");
    assert_eq!(after_2[1].delta, "D");
    
    // Get chunks after sequence 4 (none)
    let after_4 = streaming.chunks_after(4);
    assert_eq!(after_4.len(), 0);
    
    // Get chunks after sequence 10 (beyond end)
    let after_10 = streaming.chunks_after(10);
    assert_eq!(after_10.len(), 0);
}

#[test]
fn test_streaming_response_serialization() {
    let mut streaming = StreamingResponseMsg::new(Some("gpt-4".to_string()));
    streaming.append_chunk("Hello".to_string());
    streaming.append_chunk(" world".to_string());
    streaming.finalize(Some("stop".to_string()), None);
    
    let json = serde_json::to_string(&streaming).unwrap();
    let deserialized: StreamingResponseMsg = serde_json::from_str(&json).unwrap();
    
    assert_eq!(deserialized.content, "Hello world");
    assert_eq!(deserialized.chunks.len(), 2);
    assert_eq!(deserialized.model, Some("gpt-4".to_string()));
    assert_eq!(deserialized.finish_reason, Some("stop".to_string()));
}
