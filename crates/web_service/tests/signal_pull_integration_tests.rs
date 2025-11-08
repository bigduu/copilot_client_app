/// Signal-Pull Architecture Integration Tests
/// 
/// Tests the integration of:
/// - Context streaming methods (begin, append, finalize)
/// - REST API endpoints (metadata, messages, streaming-chunks)
/// - Message Pool storage layer
use context_manager::structs::context::ChatContext;
use context_manager::structs::message::{InternalMessage, Role};
use context_manager::MessageType;
use uuid::Uuid;
use web_service::storage::{MessagePoolStorageProvider, StorageProvider};

#[tokio::test]
async fn test_streaming_response_lifecycle_with_storage() {
    // Setup: Create storage and context
    let temp_dir = tempfile::TempDir::new().unwrap();
    let storage = MessagePoolStorageProvider::new(temp_dir.path());
    
    let context_id = Uuid::new_v4();
    let mut context = ChatContext::new(
        context_id,
        "gpt-4".to_string(),
        "code".to_string(),
    );
    
    // Add a user message first
    let user_message = InternalMessage {
        role: Role::User,
        content: vec![],
        tool_calls: None,
        tool_result: None,
        message_type: MessageType::Text,
        metadata: Default::default(),
        rich_type: None,
    };
    context.add_message_to_branch("main", user_message);
    
    // Test: Begin streaming response
    let message_id = context.begin_streaming_llm_response(Some("gpt-4".to_string()));
    assert!(message_id != Uuid::nil());
    
    // Test: Append chunks
    let chunk1 = context.append_streaming_chunk(message_id, "Hello");
    assert_eq!(chunk1, Some(1));
    
    let chunk2 = context.append_streaming_chunk(message_id, " ");
    assert_eq!(chunk2, Some(2));
    
    let chunk3 = context.append_streaming_chunk(message_id, "world!");
    assert_eq!(chunk3, Some(3));
    
    // Test: Get current sequence
    let current_seq = context.get_streaming_sequence(message_id);
    assert_eq!(current_seq, Some(3));
    
    // Test: Incremental chunk retrieval (simulating REST API)
    let chunks_after_1 = context.get_streaming_chunks_after(message_id, 1);
    assert!(chunks_after_1.is_some());
    let chunks = chunks_after_1.unwrap();
    assert_eq!(chunks.len(), 2); // sequence 2 and 3
    assert_eq!(chunks[0].0, 2);
    assert_eq!(chunks[0].1, " ");
    assert_eq!(chunks[1].0, 3);
    assert_eq!(chunks[1].1, "world!");
    
    // Test: Finalize streaming
    let finalized = context.finalize_streaming_response(message_id, Some("stop".to_string()), None);
    assert!(finalized);
    
    // Test: Save to storage
    storage.save_context(&context).await.unwrap();
    
    // Test: Verify directory structure
    let context_dir = temp_dir.path().join("contexts").join(context_id.to_string());
    assert!(context_dir.exists());
    assert!(context_dir.join("context.json").exists());
    assert!(context_dir.join("messages_pool").exists());
    assert!(context_dir.join("messages_pool").join(format!("{}.json", message_id)).exists());
    
    // Test: Load from storage and verify
    let loaded_context = storage.load_context(context_id).await.unwrap().unwrap();
    assert_eq!(loaded_context.id, context_id);
    assert_eq!(loaded_context.message_pool.len(), 2); // user + assistant
    
    // Verify streaming response was preserved
    let loaded_message = loaded_context.message_pool.get(&message_id).unwrap();
    if let Some(rich_type) = &loaded_message.message.rich_type {
        match rich_type {
            context_manager::structs::message_types::RichMessageType::StreamingResponse(streaming) => {
                assert_eq!(streaming.content, "Hello world!");
                assert_eq!(streaming.chunks.len(), 3);
                assert_eq!(streaming.finish_reason, Some("stop".to_string()));
                assert!(streaming.completed_at.is_some());
            }
            _ => panic!("Expected StreamingResponse type"),
        }
    } else {
        panic!("Expected rich_type to be Some");
    }
}

#[tokio::test]
async fn test_incremental_content_pull() {
    // Simulate frontend pulling content incrementally
    let context_id = Uuid::new_v4();
    let mut context = ChatContext::new(
        context_id,
        "gpt-4".to_string(),
        "code".to_string(),
    );
    
    let message_id = context.begin_streaming_llm_response(Some("gpt-4".to_string()));
    
    // Simulate multiple streaming chunks arriving
    context.append_streaming_chunk(message_id, "The");
    context.append_streaming_chunk(message_id, " quick");
    context.append_streaming_chunk(message_id, " brown");
    context.append_streaming_chunk(message_id, " fox");
    
    // Frontend pulls incrementally (like REST API calls)
    // First pull: from sequence 0
    let chunks_0 = context.get_streaming_chunks_after(message_id, 0).unwrap();
    assert_eq!(chunks_0.len(), 4);
    let local_seq = chunks_0.last().unwrap().0;
    assert_eq!(local_seq, 4);
    
    // More chunks arrive
    context.append_streaming_chunk(message_id, " jumps");
    context.append_streaming_chunk(message_id, " over");
    
    // Second pull: from last known sequence
    let chunks_4 = context.get_streaming_chunks_after(message_id, local_seq).unwrap();
    assert_eq!(chunks_4.len(), 2);
    assert_eq!(chunks_4[0].1, " jumps");
    assert_eq!(chunks_4[1].1, " over");
    
    // Final pull after completion
    context.finalize_streaming_response(message_id, None, None);
    let final_chunks = context.get_streaming_chunks_after(message_id, 6).unwrap();
    assert_eq!(final_chunks.len(), 0); // No new chunks
}

#[tokio::test]
async fn test_multiple_contexts_storage() {
    // Test multiple contexts can be stored and loaded independently
    let temp_dir = tempfile::TempDir::new().unwrap();
    let storage = MessagePoolStorageProvider::new(temp_dir.path());
    
    // Create multiple contexts
    let context1_id = Uuid::new_v4();
    let mut context1 = ChatContext::new(context1_id, "gpt-4".to_string(), "code".to_string());
    let msg1_id = context1.begin_streaming_llm_response(Some("gpt-4".to_string()));
    context1.append_streaming_chunk(msg1_id, "Context 1 message");
    context1.finalize_streaming_response(msg1_id, None, None);
    
    let context2_id = Uuid::new_v4();
    let mut context2 = ChatContext::new(context2_id, "gpt-3.5".to_string(), "chat".to_string());
    let msg2_id = context2.begin_streaming_llm_response(Some("gpt-3.5".to_string()));
    context2.append_streaming_chunk(msg2_id, "Context 2 message");
    context2.finalize_streaming_response(msg2_id, None, None);
    
    // Save both
    storage.save_context(&context1).await.unwrap();
    storage.save_context(&context2).await.unwrap();
    
    // List contexts
    let contexts = storage.list_contexts().await.unwrap();
    assert_eq!(contexts.len(), 2);
    assert!(contexts.contains(&context1_id));
    assert!(contexts.contains(&context2_id));
    
    // Load independently and verify isolation
    let loaded1 = storage.load_context(context1_id).await.unwrap().unwrap();
    let loaded2 = storage.load_context(context2_id).await.unwrap().unwrap();
    
    assert_eq!(loaded1.config.model_id, "gpt-4");
    assert_eq!(loaded2.config.model_id, "gpt-3.5");
    assert_eq!(loaded1.message_pool.len(), 1);
    assert_eq!(loaded2.message_pool.len(), 1);
    
    // Delete one context
    storage.delete_context(context1_id).await.unwrap();
    
    // Verify only one remains
    let remaining = storage.list_contexts().await.unwrap();
    assert_eq!(remaining.len(), 1);
    assert!(remaining.contains(&context2_id));
    assert!(!remaining.contains(&context1_id));
}

#[tokio::test]
async fn test_streaming_metadata_persistence() {
    // Test that streaming metadata is correctly saved and loaded
    let temp_dir = tempfile::TempDir::new().unwrap();
    let storage = MessagePoolStorageProvider::new(temp_dir.path());
    
    let context_id = Uuid::new_v4();
    let mut context = ChatContext::new(context_id, "gpt-4".to_string(), "code".to_string());
    
    let message_id = context.begin_streaming_llm_response(Some("gpt-4-turbo".to_string()));
    
    // Add multiple chunks with delays to create meaningful timing data
    for i in 0..5 {
        context.append_streaming_chunk(message_id, format!("chunk_{} ", i));
        // In real scenario, there would be delays between chunks
    }
    
    // Finalize with usage data
    use context_manager::structs::metadata::TokenUsage;
    let usage = TokenUsage {
        prompt_tokens: Some(100),
        completion_tokens: Some(50),
    };
    context.finalize_streaming_response(message_id, Some("stop".to_string()), Some(usage));
    
    // Save and reload
    storage.save_context(&context).await.unwrap();
    let loaded = storage.load_context(context_id).await.unwrap().unwrap();
    
    // Verify metadata
    let loaded_node = loaded.message_pool.get(&message_id).unwrap();
    let metadata = &loaded_node.message.metadata;
    assert!(metadata.is_some());
    
    let meta = metadata.as_ref().unwrap();
    assert!(meta.streaming.is_some());
    
    let streaming = meta.streaming.as_ref().unwrap();
    assert_eq!(streaming.chunks_count, 5);
    assert!(streaming.completed_at.is_some());
    assert!(streaming.total_duration_ms.is_some());
    
    // Verify rich type
    if let Some(rich_type) = &loaded_node.message.rich_type {
        match rich_type {
            context_manager::structs::message_types::RichMessageType::StreamingResponse(streaming) => {
                assert_eq!(streaming.model, Some("gpt-4-turbo".to_string()));
                assert_eq!(streaming.finish_reason, Some("stop".to_string()));
                assert!(streaming.usage.is_some());
                let usage_loaded = streaming.usage.as_ref().unwrap();
                assert_eq!(usage_loaded.prompt_tokens, Some(100));
                assert_eq!(usage_loaded.completion_tokens, Some(50));
            }
            _ => panic!("Expected StreamingResponse type"),
        }
    }
}

#[tokio::test]
async fn test_storage_migration_compatibility() {
    // Test that contexts can be saved and loaded with message pool architecture
    let temp_dir = tempfile::TempDir::new().unwrap();
    let storage = MessagePoolStorageProvider::new(temp_dir.path());
    
    let context_id = Uuid::new_v4();
    let mut context = ChatContext::new(context_id, "test".to_string(), "test".to_string());
    
    // Add multiple messages
    for i in 0..10 {
        let user_msg = InternalMessage {
            role: Role::User,
            content: vec![],
            tool_calls: None,
            tool_result: None,
            message_type: MessageType::Text,
            metadata: Default::default(),
            rich_type: None,
        };
        context.add_message_to_branch("main", user_msg);
        
        let msg_id = context.begin_streaming_llm_response(Some("test".to_string()));
        context.append_streaming_chunk(msg_id, format!("Response {}", i));
        context.finalize_streaming_response(msg_id, None, None);
    }
    
    // Save
    storage.save_context(&context).await.unwrap();
    
    // Verify all message files exist
    let messages_dir = temp_dir.path()
        .join("contexts")
        .join(context_id.to_string())
        .join("messages_pool");
    
    let mut file_count = 0;
    for entry in std::fs::read_dir(&messages_dir).unwrap() {
        let entry = entry.unwrap();
        if entry.path().extension().map_or(false, |ext| ext == "json") {
            file_count += 1;
        }
    }
    
    assert_eq!(file_count, 20); // 10 user + 10 assistant messages
    
    // Load and verify
    let loaded = storage.load_context(context_id).await.unwrap().unwrap();
    assert_eq!(loaded.message_pool.len(), 20);
}

