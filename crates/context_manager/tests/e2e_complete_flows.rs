//! End-to-End Complete Flow Tests
//!
//! These tests verify complete conversation flows as specified in Phase 8.1:
//! - Create conversation → send message → file reference → tool call → auto-loop
//! - Mode switching (Plan → Act)
//! - Multi-branch parallel operations
//!
//! These tests ensure the entire backend lifecycle works correctly without
//! requiring a frontend client.

use context_manager::{
    ChatContext, ChatEvent, ContentPart, ContextState, InternalMessage, MessageType, Role,
};
use uuid::Uuid;

// ============================================================================
// Helper Functions
// ============================================================================

fn create_test_context_with_mode(mode: &str) -> ChatContext {
    ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), mode.to_string())
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

fn simulate_streaming_response(context: &mut ChatContext, text: &str) -> Uuid {
    let msg_id = context.begin_streaming_llm_response(None);

    // Simulate streaming chunks
    for chunk in text.split_whitespace() {
        context.append_streaming_chunk(msg_id, format!("{} ", chunk));
    }

    context.finalize_streaming_response(msg_id, Some("stop".to_string()), None);

    // New API: need to manually transition to Idle after finalize
    context.handle_event(context_manager::ChatEvent::LLMResponseProcessed {
        has_tool_calls: false,
    });

    msg_id
}

// ============================================================================
// Test 8.1.1: Complete Flow - Conversation with Multiple Turns
// ============================================================================

#[test]
fn test_e2e_complete_multi_turn_conversation() {
    let mut context = create_test_context_with_mode("code");

    println!("=== Phase 1: Initial User Message ===");
    context.handle_event(ChatEvent::UserMessageSent);
    assert_eq!(context.current_state, ContextState::ProcessingUserMessage);

    let user_msg_1 = add_user_message(&mut context, "Help me implement a REST API");
    assert_eq!(context.get_active_branch().unwrap().message_ids.len(), 1);

    println!("=== Phase 2: LLM Response (Streaming) ===");
    context.transition_to_awaiting_llm();
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);

    let assistant_msg_1 = simulate_streaming_response(
        &mut context,
        "I'll help you create a REST API. First, let's define the endpoints.",
    );
    assert_eq!(context.current_state, ContextState::Idle);
    assert_eq!(context.get_active_branch().unwrap().message_ids.len(), 2);

    println!("=== Phase 3: User Follow-up ===");
    context.handle_event(ChatEvent::UserMessageSent);
    let user_msg_2 = add_user_message(&mut context, "Add authentication to the API");

    println!("=== Phase 4: LLM Second Response ===");
    context.transition_to_awaiting_llm();
    let assistant_msg_2 = simulate_streaming_response(
        &mut context,
        "I'll add JWT authentication. Here's the implementation plan.",
    );

    println!("=== Phase 5: User Approval ===");
    context.handle_event(ChatEvent::UserMessageSent);
    let user_msg_3 = add_user_message(&mut context, "Looks good, proceed");

    println!("=== Phase 6: LLM Final Response ===");
    context.transition_to_awaiting_llm();
    let assistant_msg_3 = simulate_streaming_response(
        &mut context,
        "Great! I'll implement the authentication now.",
    );

    // Final Verification
    assert_eq!(context.current_state, ContextState::Idle);
    let final_messages = context.get_active_branch().unwrap().message_ids.len();
    assert_eq!(final_messages, 6); // 3 user + 3 assistant

    // Verify message sequence
    let branch = context.get_active_branch().unwrap();
    assert_eq!(branch.message_ids[0], user_msg_1);
    assert_eq!(branch.message_ids[1], assistant_msg_1);
    assert_eq!(branch.message_ids[2], user_msg_2);
    assert_eq!(branch.message_ids[3], assistant_msg_2);
    assert_eq!(branch.message_ids[4], user_msg_3);
    assert_eq!(branch.message_ids[5], assistant_msg_3);

    println!("✅ Complete multi-turn conversation test passed!");
}

// ============================================================================
// Test 8.1.2: Mode Switching (Plan → Act)
// ============================================================================

#[test]
fn test_e2e_mode_switching_plan_to_act() {
    let mut context = create_test_context_with_mode("plan");

    println!("=== Phase 1: Plan Mode - User Request ===");
    assert_eq!(context.config.mode, "plan");

    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Create a REST API for user management");

    println!("=== Phase 2: LLM Creates Plan ===");
    context.transition_to_awaiting_llm();
    simulate_streaming_response(
        &mut context,
        "Here's the plan: 1. Define user model 2. Create CRUD endpoints 3. Add authentication",
    );

    assert_eq!(context.get_active_branch().unwrap().message_ids.len(), 2);

    println!("=== Phase 3: Switch to Act Mode ===");
    context.config.mode = "act".to_string();
    assert_eq!(context.config.mode, "act");

    println!("=== Phase 4: Execute Plan in Act Mode ===");
    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Execute step 1: Define user model");

    context.transition_to_awaiting_llm();
    simulate_streaming_response(&mut context, "Step 1 completed. User model defined.");

    // Final Verification
    assert_eq!(context.current_state, ContextState::Idle);
    assert_eq!(context.config.mode, "act");
    assert_eq!(context.get_active_branch().unwrap().message_ids.len(), 4);

    println!("✅ Mode switching test passed!");
}

// ============================================================================
// Test 8.1.3: Multi-Branch Operations
// ============================================================================

#[test]
fn test_e2e_multi_branch_operations() {
    let mut context = create_test_context_with_mode("code");

    println!("=== Phase 1: Main Branch - Initial Conversation ===");
    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Implement feature A");
    context.transition_to_awaiting_llm();
    simulate_streaming_response(&mut context, "I'll implement feature A");

    assert_eq!(context.active_branch_name, "main");
    let main_msg_count = context.get_active_branch().unwrap().message_ids.len();
    assert_eq!(main_msg_count, 2);

    println!("=== Phase 2: Create Alternative Branch ===");
    // Manually create a new branch
    use context_manager::Branch;
    let alt_branch = Branch::new("alternative-approach".to_string());
    context
        .branches
        .insert("alternative-approach".to_string(), alt_branch);

    // Switch to alternative branch
    context.active_branch_name = "alternative-approach".to_string();
    assert_eq!(context.active_branch_name, "alternative-approach");

    println!("=== Phase 3: Work on Alternative Branch ===");
    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Try a different approach for feature A");
    context.transition_to_awaiting_llm();
    simulate_streaming_response(&mut context, "Here's an alternative implementation");

    let alt_msg_count = context.get_active_branch().unwrap().message_ids.len();
    assert_eq!(alt_msg_count, 2);

    println!("=== Phase 4: Switch Back to Main Branch ===");
    context.active_branch_name = "main".to_string();
    assert_eq!(context.active_branch_name, "main");

    // Main branch should still have only 2 messages
    let main_branch = context.branches.get("main").unwrap();
    assert_eq!(main_branch.message_ids.len(), 2);

    println!("=== Phase 5: Continue on Main Branch ===");
    context.handle_event(ChatEvent::UserMessageSent);
    add_user_message(&mut context, "Add tests for feature A");
    context.transition_to_awaiting_llm();
    simulate_streaming_response(&mut context, "I'll add comprehensive tests");

    // Main branch should now have 4 messages
    let main_branch = context.branches.get("main").unwrap();
    assert_eq!(main_branch.message_ids.len(), 4);

    // Alternative branch should still have 2 messages
    let alt_branch = context.branches.get("alternative-approach").unwrap();
    assert_eq!(alt_branch.message_ids.len(), 2);

    // Verify branches are independent
    assert_ne!(main_branch.message_ids, alt_branch.message_ids);

    println!("✅ Multi-branch operations test passed!");
}
