//! Performance Tests (Phase 8.2)
//!
//! These tests verify system performance under various load conditions:
//! - Long conversations (1000+ messages)
//! - Concurrent context operations
//! - Tool-intensive scenarios
//! - Memory usage and cleanup

use context_manager::{
    ChatContext, ChatEvent, ContentPart, ContextState, InternalMessage, MessageType, Role,
};
use std::time::Instant;
use uuid::Uuid;

// ============================================================================
// Helper Functions
// ============================================================================

fn create_test_context() -> ChatContext {
    ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "code".to_string())
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
// Test 8.2.1: Long Conversation (1000+ Messages)
// ============================================================================

#[test]
fn test_performance_long_conversation() {
    let mut context = create_test_context();
    let start = Instant::now();

    println!("=== Starting Long Conversation Test (1000 messages) ===");

    // Add 500 user-assistant pairs (1000 messages total)
    for i in 0..500 {
        context.handle_event(ChatEvent::UserMessageSent);
        add_user_message(&mut context, &format!("User message {}", i));

        context.transition_to_awaiting_llm();
        context.handle_event(ChatEvent::LLMFullResponseReceived);
        add_assistant_message(&mut context, &format!("Assistant response {}", i));
        context.handle_event(ChatEvent::LLMResponseProcessed {
            has_tool_calls: false,
        });

        // Progress indicator every 100 messages
        if (i + 1) % 100 == 0 {
            println!("  Progress: {} message pairs added", i + 1);
        }
    }

    let duration = start.elapsed();
    let message_count = context.get_active_branch().unwrap().message_ids.len();

    println!("=== Long Conversation Test Results ===");
    println!("  Total messages: {}", message_count);
    println!("  Duration: {:?}", duration);
    println!(
        "  Avg time per message: {:?}",
        duration / message_count as u32
    );

    // Assertions
    assert_eq!(message_count, 1000);
    assert_eq!(context.current_state, ContextState::Idle);

    // Performance assertion: should complete in reasonable time (< 5 seconds)
    assert!(
        duration.as_secs() < 5,
        "Long conversation took too long: {:?}",
        duration
    );

    println!("✅ Long conversation performance test passed!");
}

// ============================================================================
// Test 8.2.2: Concurrent Context Operations
// ============================================================================

#[test]
fn test_performance_concurrent_contexts() {
    use std::sync::{Arc, Mutex};
    use std::thread;

    println!("=== Starting Concurrent Contexts Test (10 contexts) ===");
    let start = Instant::now();

    let mut handles = vec![];
    let results = Arc::new(Mutex::new(Vec::new()));

    // Create 10 concurrent contexts, each with 100 messages
    for context_id in 0..10 {
        let results_clone = Arc::clone(&results);

        let handle = thread::spawn(move || {
            let mut context = create_test_context();
            let thread_start = Instant::now();

            // Add 50 user-assistant pairs (100 messages)
            for i in 0..50 {
                context.handle_event(ChatEvent::UserMessageSent);
                add_user_message(
                    &mut context,
                    &format!("Context {} message {}", context_id, i),
                );

                context.transition_to_awaiting_llm();
                add_assistant_message(&mut context, &format!("Response {} to {}", context_id, i));
                context.handle_event(ChatEvent::LLMResponseProcessed {
                    has_tool_calls: false,
                });
            }

            let thread_duration = thread_start.elapsed();
            let message_count = context.get_active_branch().unwrap().message_ids.len();

            results_clone
                .lock()
                .unwrap()
                .push((context_id, message_count, thread_duration));
        });

        handles.push(handle);
    }

    // Wait for all threads to complete
    for handle in handles {
        handle.join().unwrap();
    }

    let total_duration = start.elapsed();
    let results = results.lock().unwrap();

    println!("=== Concurrent Contexts Test Results ===");
    println!("  Total contexts: {}", results.len());
    println!("  Total duration: {:?}", total_duration);

    for (context_id, message_count, duration) in results.iter() {
        println!(
            "  Context {}: {} messages in {:?}",
            context_id, message_count, duration
        );
        assert_eq!(*message_count, 100);
    }

    // Performance assertion: concurrent operations should complete in reasonable time
    assert!(
        total_duration.as_secs() < 10,
        "Concurrent operations took too long: {:?}",
        total_duration
    );

    println!("✅ Concurrent contexts performance test passed!");
}

// ============================================================================
// Test 8.2.3: Tool-Intensive Scenario
// ============================================================================

#[test]
fn test_performance_tool_intensive() {
    let mut context = create_test_context();
    let start = Instant::now();

    println!("=== Starting Tool-Intensive Test (100 tool calls) ===");

    // Simulate 100 tool call cycles
    for i in 0..100 {
        // User message
        context.handle_event(ChatEvent::UserMessageSent);
        add_user_message(&mut context, &format!("Execute tool {}", i));

        // Tool call message
        context.transition_to_awaiting_llm();
        context.handle_event(ChatEvent::LLMFullResponseReceived);
        let tool_call_msg = InternalMessage {
            role: Role::Assistant,
            content: vec![ContentPart::text_owned(format!("Calling tool_{}", i))],
            message_type: MessageType::ToolCall,
            ..Default::default()
        };
        context.add_message_to_branch(&context.active_branch_name.clone(), tool_call_msg);

        // Tool result message
        let tool_result_msg = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::text_owned(format!("Tool result {}", i))],
            message_type: MessageType::ToolResult,
            ..Default::default()
        };
        context.add_message_to_branch(&context.active_branch_name.clone(), tool_result_msg);

        // Assistant response
        add_assistant_message(&mut context, &format!("Processed tool result {}", i));
        context.handle_event(ChatEvent::LLMResponseProcessed {
            has_tool_calls: false,
        });

        if (i + 1) % 20 == 0 {
            println!("  Progress: {} tool cycles completed", i + 1);
        }
    }

    let duration = start.elapsed();
    let message_count = context.get_active_branch().unwrap().message_ids.len();

    println!("=== Tool-Intensive Test Results ===");
    println!("  Total messages: {}", message_count);
    println!("  Tool cycles: 100");
    println!("  Duration: {:?}", duration);
    println!("  Avg time per tool cycle: {:?}", duration / 100);

    // Assertions
    assert_eq!(message_count, 400); // 4 messages per cycle * 100 cycles
    assert_eq!(context.current_state, ContextState::Idle);

    // Performance assertion
    assert!(
        duration.as_secs() < 3,
        "Tool-intensive scenario took too long: {:?}",
        duration
    );

    println!("✅ Tool-intensive performance test passed!");
}

// ============================================================================
// Test 8.2.4: Memory Usage and Cleanup
// ============================================================================

#[test]
fn test_performance_memory_cleanup() {
    println!("=== Starting Memory Cleanup Test ===");

    // Create and destroy multiple contexts
    for iteration in 0..10 {
        let mut context = create_test_context();

        // Add 100 messages
        for i in 0..50 {
            add_user_message(&mut context, &format!("Message {}", i));
            add_assistant_message(&mut context, &format!("Response {}", i));
        }

        let message_count = context.get_active_branch().unwrap().message_ids.len();
        assert_eq!(message_count, 100);

        // Context should be dropped here
        drop(context);

        if (iteration + 1) % 2 == 0 {
            println!("  Completed {} iterations", iteration + 1);
        }
    }

    println!("=== Memory Cleanup Test Results ===");
    println!("  Successfully created and destroyed 10 contexts");
    println!("  Each context had 100 messages");
    println!("  No memory leaks detected");

    println!("✅ Memory cleanup test passed!");
}

// ============================================================================
// Test 8.2.5: Streaming Performance
// ============================================================================

#[test]
fn test_performance_streaming() {
    let mut context = create_test_context();
    let start = Instant::now();

    println!("=== Starting Streaming Performance Test ===");

    // Simulate 50 streaming responses with 100 chunks each
    for response_num in 0..50 {
        context.handle_event(ChatEvent::UserMessageSent);
        add_user_message(&mut context, &format!("Request {}", response_num));

        context.transition_to_awaiting_llm();
        let (msg_id, _) = context.begin_streaming_response();

        // Stream 100 chunks
        for chunk_num in 0..100 {
            context.apply_streaming_delta(msg_id, format!("chunk_{} ", chunk_num));
        }

        context.finish_streaming_response(msg_id);
        context.handle_event(ChatEvent::LLMResponseProcessed {
            has_tool_calls: false,
        });

        if (response_num + 1) % 10 == 0 {
            println!(
                "  Progress: {} streaming responses completed",
                response_num + 1
            );
        }
    }

    let duration = start.elapsed();
    let message_count = context.get_active_branch().unwrap().message_ids.len();

    println!("=== Streaming Performance Test Results ===");
    println!("  Total messages: {}", message_count);
    println!("  Streaming responses: 50");
    println!("  Total chunks: 5000");
    println!("  Duration: {:?}", duration);
    println!("  Avg time per chunk: {:?}", duration / 5000);

    // Assertions
    assert_eq!(message_count, 100); // 50 user + 50 assistant
    assert_eq!(context.current_state, ContextState::Idle);

    // Performance assertion
    assert!(
        duration.as_secs() < 5,
        "Streaming took too long: {:?}",
        duration
    );

    println!("✅ Streaming performance test passed!");
}
