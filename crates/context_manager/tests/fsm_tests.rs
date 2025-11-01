//! Tests for the FSM state machine

use context_manager::{ChatContext, ChatEvent, ContextState};
use uuid::Uuid;

#[test]
fn test_fsm_idle_to_processing_user_message() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    assert_eq!(context.current_state, ContextState::Idle);
    
    context.handle_event(ChatEvent::UserMessageSent);
    assert_eq!(context.current_state, ContextState::ProcessingUserMessage);
}

#[test]
fn test_fsm_processing_user_message_to_awaiting_llm_response() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::ProcessingUserMessage;
    context.handle_event(ChatEvent::LLMRequestInitiated);
    
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);
}

#[test]
fn test_fsm_awaiting_llm_response_to_streaming() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::AwaitingLLMResponse;
    context.handle_event(ChatEvent::LLMStreamStarted);
    
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);
}

#[test]
fn test_fsm_awaiting_llm_response_to_full_response() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::AwaitingLLMResponse;
    context.handle_event(ChatEvent::LLMFullResponseReceived);
    
    assert_eq!(context.current_state, ContextState::ProcessingLLMResponse);
}

#[test]
fn test_fsm_streaming_to_processing() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::StreamingLLMResponse;
    context.handle_event(ChatEvent::LLMStreamEnded);
    
    assert_eq!(context.current_state, ContextState::ProcessingLLMResponse);
}

#[test]
fn test_fsm_processing_with_tool_calls() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::ProcessingLLMResponse;
    context.handle_event(ChatEvent::LLMResponseProcessed { has_tool_calls: true });
    
    assert_eq!(context.current_state, ContextState::AwaitingToolApproval);
}

#[test]
fn test_fsm_processing_without_tool_calls() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::ProcessingLLMResponse;
    context.handle_event(ChatEvent::LLMResponseProcessed { has_tool_calls: false });
    
    assert_eq!(context.current_state, ContextState::Idle);
}

#[test]
fn test_fsm_tool_approval_approved() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::AwaitingToolApproval;
    context.handle_event(ChatEvent::ToolCallsApproved);
    
    assert_eq!(context.current_state, ContextState::ExecutingTools);
}

#[test]
fn test_fsm_tool_approval_denied() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::AwaitingToolApproval;
    context.handle_event(ChatEvent::ToolCallsDenied);
    
    assert_eq!(context.current_state, ContextState::GeneratingResponse);
}

#[test]
fn test_fsm_executing_tools_to_processing_results() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::ExecutingTools;
    context.handle_event(ChatEvent::ToolExecutionCompleted);
    
    assert_eq!(context.current_state, ContextState::ProcessingToolResults);
}

#[test]
fn test_fsm_processing_results_to_generating_response() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::ProcessingToolResults;
    context.handle_event(ChatEvent::LLMRequestInitiated);
    
    assert_eq!(context.current_state, ContextState::GeneratingResponse);
}

#[test]
fn test_fsm_generating_response_to_awaiting_llm() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::GeneratingResponse;
    context.handle_event(ChatEvent::LLMRequestInitiated);
    
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);
}

#[test]
fn test_fsm_fatal_error() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::AwaitingLLMResponse;
    context.handle_event(ChatEvent::FatalError { error: "Test error".to_string() });
    
    assert_eq!(context.current_state, ContextState::Failed { error: "Test error".to_string() });
}

#[test]
fn test_fsm_transient_failure_retry_success() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::TransientFailure { 
        error: "Retryable error".to_string(),
        retry_count: 1,
    };
    context.handle_event(ChatEvent::Retry);
    
    assert_eq!(context.current_state, ContextState::AwaitingLLMResponse);
}

#[test]
fn test_fsm_transient_failure_retry_exceeded() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::TransientFailure { 
        error: "Retryable error".to_string(),
        retry_count: 3,
    };
    context.handle_event(ChatEvent::Retry);
    
    // Should fail after max retries
    let expected_error = format!("Max retries exceeded. Last error: {}", "Retryable error");
    assert_eq!(context.current_state, ContextState::Failed { error: expected_error });
}

#[test]
fn test_fsm_invalid_transition_ignored() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    let initial_state = context.current_state.clone();
    
    // Try an invalid transition
    context.handle_event(ChatEvent::LLMStreamEnded);
    
    // State should remain unchanged
    assert_eq!(context.current_state, initial_state);
}

#[test]
fn test_fsm_streaming_chunks_same_state() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::StreamingLLMResponse;
    
    // Multiple chunk events should keep us in the same state
    context.handle_event(ChatEvent::LLMStreamChunkReceived);
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);
    
    context.handle_event(ChatEvent::LLMStreamChunkReceived);
    assert_eq!(context.current_state, ContextState::StreamingLLMResponse);
}

#[test]
fn test_fsm_tool_execution_failed() {
    let mut context = ChatContext::new(
        Uuid::new_v4(),
        "gpt-4".to_string(),
        "default".to_string(),
    );
    
    context.current_state = ContextState::ExecutingTools;
    context.handle_event(ChatEvent::ToolExecutionFailed { 
        error: "Tool error".to_string(),
        retry_count: 0,
    });
    
    assert_eq!(
        context.current_state,
        ContextState::TransientFailure { 
            error: "Tool error".to_string(),
            retry_count: 0,
        }
    );
}

