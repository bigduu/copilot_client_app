//! Migration Tests (Phase 8.3)
//!
//! These tests verify:
//! - Old data format migration to new architecture
//! - API compatibility with existing clients
//! - Backward compatibility for stored contexts
//! - Data integrity during migration

use context_manager::{ChatConfig, ChatContext, ContentPart, InternalMessage, MessageType, Role};
use serde_json::json;
use uuid::Uuid;

// ============================================================================
// Test 8.3.1: Legacy Context Format Migration
// ============================================================================

#[test]
fn test_migration_legacy_context_format() {
    println!("=== Testing Legacy Context Format Migration ===");

    // Simulate legacy context JSON format (pre-refactor)
    let legacy_json = json!({
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "parent_id": null,
        "config": {
            "model_id": "gpt-4",
            "mode": "code",
            "parameters": {},
            "system_prompt_id": null,
            "agent_role": "actor",
            "workspace_path": null
        },
        "message_pool": {},
        "branches": {
            "main": {
                "name": "main",
                "message_ids": [],
                "parent_message_id": null
            }
        },
        "active_branch_name": "main",
        "current_state": "idle"
    });

    // Attempt to deserialize legacy format
    let result: Result<ChatContext, _> = serde_json::from_value(legacy_json);

    match result {
        Ok(context) => {
            println!("  ✓ Successfully migrated legacy context");
            assert_eq!(context.active_branch_name, "main");
            assert_eq!(context.config.model_id, "gpt-4");
            assert_eq!(context.config.mode, "code");
        }
        Err(e) => {
            println!("  ✗ Migration failed: {}", e);
            panic!("Legacy context migration should succeed");
        }
    }

    println!("✅ Legacy context format migration test passed!");
}

// ============================================================================
// Test 8.3.2: Message Format Compatibility
// ============================================================================

#[test]
fn test_migration_message_format_compatibility() {
    println!("=== Testing Message Format Compatibility ===");

    // Test all message types can be serialized and deserialized
    let message_types = vec![
        MessageType::Text,
        MessageType::Plan,
        MessageType::Question,
        MessageType::ToolCall,
        MessageType::ToolResult,
    ];

    for msg_type in message_types {
        let message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text_owned("Test content".to_string())],
            message_type: msg_type.clone(),
            ..Default::default()
        };

        // Serialize
        let json = serde_json::to_string(&message).expect("Should serialize");

        // Deserialize
        let deserialized: InternalMessage =
            serde_json::from_str(&json).expect("Should deserialize");

        assert_eq!(deserialized.message_type, msg_type);
        assert_eq!(deserialized.role, Role::User);

        println!("  ✓ {:?} message type compatible", msg_type);
    }

    println!("✅ Message format compatibility test passed!");
}

// ============================================================================
// Test 8.3.3: Config Migration
// ============================================================================

#[test]
fn test_migration_config_compatibility() {
    println!("=== Testing Config Migration ===");

    // Test various config formats
    let configs = vec![
        // Minimal config
        json!({
            "model_id": "gpt-4",
            "mode": "code",
            "parameters": {},
            "system_prompt_id": null,
            "agent_role": "actor",
            "workspace_path": null
        }),
        // Config with parameters
        json!({
            "model_id": "gpt-4-turbo",
            "mode": "plan",
            "parameters": {
                "temperature": 0.7,
                "max_tokens": 2000
            },
            "system_prompt_id": "custom-prompt-1",
            "agent_role": "planner",
            "workspace_path": "/path/to/workspace"
        }),
    ];

    for (idx, config_json) in configs.iter().enumerate() {
        let result: Result<ChatConfig, _> = serde_json::from_value(config_json.clone());

        match result {
            Ok(config) => {
                println!("  ✓ Config variant {} migrated successfully", idx + 1);
                assert!(!config.model_id.is_empty());
                assert!(!config.mode.is_empty());
            }
            Err(e) => {
                println!("  ✗ Config variant {} failed: {}", idx + 1, e);
                panic!("Config migration should succeed");
            }
        }
    }

    println!("✅ Config migration test passed!");
}

// ============================================================================
// Test 8.3.4: Branch Structure Migration
// ============================================================================

#[test]
fn test_migration_branch_structure() {
    println!("=== Testing Branch Structure Migration ===");

    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "code".to_string());

    // Add messages to main branch
    let msg1 = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text_owned("Message 1".to_string())],
        message_type: MessageType::Text,
        ..Default::default()
    };
    context.add_message_to_branch("main", msg1);

    // Serialize context
    let json = serde_json::to_string(&context).expect("Should serialize");

    // Deserialize context
    let restored: ChatContext = serde_json::from_str(&json).expect("Should deserialize");

    // Verify branch structure
    assert_eq!(restored.branches.len(), context.branches.len());
    assert_eq!(restored.active_branch_name, context.active_branch_name);
    assert_eq!(
        restored.get_active_branch().unwrap().message_ids.len(),
        context.get_active_branch().unwrap().message_ids.len()
    );

    println!("  ✓ Branch structure preserved");
    println!("✅ Branch structure migration test passed!");
}

// ============================================================================
// Test 8.3.5: API Backward Compatibility
// ============================================================================

#[test]
fn test_migration_api_backward_compatibility() {
    println!("=== Testing API Backward Compatibility ===");

    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "code".to_string());

    // Test that old API methods still work

    // 1. Adding messages
    let msg = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text_owned("Test".to_string())],
        message_type: MessageType::Text,
        ..Default::default()
    };
    let msg_id = context.add_message_to_branch(&context.active_branch_name.clone(), msg);
    assert!(context.message_pool.contains_key(&msg_id));
    println!("  ✓ add_message_to_branch API compatible");

    // 2. Getting active branch
    let branch = context.get_active_branch();
    assert!(branch.is_some());
    println!("  ✓ get_active_branch API compatible");

    // 3. State transitions
    context.transition_to_awaiting_llm();
    println!("  ✓ transition_to_awaiting_llm API compatible");

    // 4. Streaming operations (using NEW API)
    let stream_msg_id = context.begin_streaming_llm_response(None);
    context.append_streaming_chunk(stream_msg_id, "test".to_string());
    context.finalize_streaming_response(stream_msg_id, Some("stop".to_string()), None);
    println!("  ✓ Streaming APIs compatible");

    println!("✅ API backward compatibility test passed!");
}

// ============================================================================
// Test 8.3.6: Data Integrity During Migration
// ============================================================================

#[test]
fn test_migration_data_integrity() {
    println!("=== Testing Data Integrity During Migration ===");

    // Create a complex context with multiple messages and branches
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "code".to_string());

    // Add multiple messages
    let mut message_ids = Vec::new();
    for i in 0..10 {
        let msg = InternalMessage {
            role: if i % 2 == 0 {
                Role::User
            } else {
                Role::Assistant
            },
            content: vec![ContentPart::text_owned(format!("Message {}", i))],
            message_type: MessageType::Text,
            ..Default::default()
        };
        let msg_id = context.add_message_to_branch(&context.active_branch_name.clone(), msg);
        message_ids.push(msg_id);
    }

    // Serialize
    let json = serde_json::to_string(&context).expect("Should serialize");

    // Deserialize
    let restored: ChatContext = serde_json::from_str(&json).expect("Should deserialize");

    // Verify data integrity
    assert_eq!(restored.id, context.id);
    assert_eq!(restored.message_pool.len(), context.message_pool.len());
    assert_eq!(restored.branches.len(), context.branches.len());
    assert_eq!(restored.active_branch_name, context.active_branch_name);

    // Verify all messages are present
    for msg_id in &message_ids {
        assert!(
            restored.message_pool.contains_key(msg_id),
            "Message {} should be present",
            msg_id
        );
    }

    // Verify message order in branch
    let original_branch = context.get_active_branch().unwrap();
    let restored_branch = restored.get_active_branch().unwrap();
    assert_eq!(restored_branch.message_ids, original_branch.message_ids);

    println!("  ✓ All {} messages preserved", message_ids.len());
    println!("  ✓ Message order preserved");
    println!("  ✓ Branch structure preserved");
    println!("  ✓ Context metadata preserved");

    println!("✅ Data integrity test passed!");
}

// ============================================================================
// Test 8.3.7: Content Part Migration
// ============================================================================

#[test]
fn test_migration_content_part_formats() {
    println!("=== Testing Content Part Format Migration ===");

    // Test text content
    let text_content = ContentPart::text_owned("Hello world".to_string());
    let json = serde_json::to_string(&text_content).expect("Should serialize");
    let restored: ContentPart = serde_json::from_str(&json).expect("Should deserialize");
    println!("  ✓ Text content part compatible");

    // Verify content is preserved
    match restored {
        ContentPart::Text { text } => assert_eq!(text, "Hello world"),
        _ => panic!("Expected text content part"),
    }

    println!("✅ Content part migration test passed!");
}
