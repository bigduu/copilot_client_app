//! Tests for ChatContext operations

use context_manager::{
    ChatContext, ContextError, ContextState, IncomingMessage, MessageType, MessageUpdate,
    PreparedLlmRequest, Role, SystemPrompt,
};
use futures::{StreamExt, executor::block_on};
use serde_json::json;
use uuid::Uuid;

#[test]
fn test_context_creation() {
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    assert_eq!(context.config.model_id, "gpt-4");
    assert_eq!(context.config.mode, "default");
    assert_eq!(context.active_branch_name, "main");
    assert_eq!(context.current_state, ContextState::Idle);
    assert!(context.branches.contains_key("main"));
}

#[test]
fn test_context_default_state() {
    let context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    assert_eq!(context.current_state, ContextState::Idle);
}

#[test]
fn test_context_cloning() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    context.current_state = ContextState::ProcessingUserMessage;

    let cloned = context.clone();
    assert_eq!(cloned.current_state, context.current_state);
    assert_eq!(cloned.config.model_id, context.config.model_id);
}

#[test]
fn test_send_message_emits_context_updates() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let stream = context
        .send_message(IncomingMessage::text("hello world"))
        .expect("send message");

    let updates: Vec<_> = block_on(stream.collect());

    assert_eq!(updates.len(), 3);
    assert_eq!(
        updates[0].current_state,
        ContextState::ProcessingUserMessage
    );
    assert_eq!(updates[0].previous_state, Some(ContextState::Idle));

    match &updates[1].message_update {
        Some(MessageUpdate::Created { role, .. }) => {
            assert_eq!(role, &Role::User);
        }
        other => panic!("expected created update, got {other:?}"),
    }

    match &updates[2].message_update {
        Some(MessageUpdate::Completed { final_message, .. }) => {
            assert_eq!(final_message.message_type, MessageType::Text);
            let content = final_message
                .content
                .first()
                .and_then(|part| part.text_content())
                .expect("text content");
            assert_eq!(content, "hello world");
        }
        other => panic!("expected completed update, got {other:?}"),
    }

    assert_eq!(context.current_state, ContextState::Idle);
    assert_eq!(context.message_pool.len(), 1);
}

#[test]
fn test_send_message_rejects_empty_content() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let result = context.send_message(IncomingMessage::text("   "));
    assert!(matches!(result, Err(ContextError::EmptyMessageContent)));
}

#[test]
fn test_stream_llm_response_produces_deltas() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let chunks = vec!["Hello".to_string(), " World".to_string()];
    let updates: Vec<_> = block_on(context.stream_llm_response(chunks).collect());

    assert!(updates.len() >= 5);
    assert_eq!(updates[0].current_state, ContextState::StreamingLLMResponse);

    let delta_count = updates
        .iter()
        .filter(|update| {
            matches!(
                update.message_update,
                Some(MessageUpdate::ContentDelta { .. })
            )
        })
        .count();
    assert_eq!(delta_count, 2);

    let completion = updates
        .iter()
        .find_map(|update| match &update.message_update {
            Some(MessageUpdate::Completed { final_message, .. }) => Some(final_message.clone()),
            _ => None,
        })
        .expect("completion update");

    let final_text = completion
        .content
        .first()
        .and_then(|part| part.text_content())
        .expect("assistant content");
    assert_eq!(final_text, "Hello World");

    assert_eq!(context.current_state, ContextState::Idle);
}

#[test]
fn test_record_tool_approval_request_updates_state() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    let request_id = Uuid::new_v4();

    context.current_state = ContextState::ProcessingLLMResponse;
    let update = context.record_tool_approval_request(request_id, "read_file");

    match &context.current_state {
        ContextState::AwaitingToolApproval {
            pending_requests,
            tool_names,
        } => {
            assert_eq!(pending_requests, &vec![request_id]);
            assert_eq!(tool_names, &vec!["read_file".to_string()]);
        }
        other => panic!("expected awaiting approval, got {other:?}"),
    }

    assert_eq!(
        update.metadata.get("tool_event"),
        Some(&json!("approval_requested"))
    );
}

#[test]
fn test_begin_tool_execution_updates_state() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    let request_id = Uuid::new_v4();
    context.current_state = ContextState::ProcessingLLMResponse;
    context.record_tool_approval_request(request_id, "read_file");

    let update = context.begin_tool_execution("read_file", 1, Some(request_id));

    assert_eq!(
        context.current_state,
        ContextState::ExecutingTool {
            tool_name: "read_file".to_string(),
            attempt: 1,
        }
    );
    assert_eq!(
        update.metadata.get("tool_event"),
        Some(&json!("execution_started"))
    );
}

#[test]
fn test_record_tool_execution_failure_updates_state() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    context.current_state = ContextState::ProcessingLLMResponse;
    context.begin_tool_execution("read_file", 1, None);

    let update = context.record_tool_execution_failure("read_file", 0, "timeout", None);

    assert_eq!(
        context.current_state,
        ContextState::TransientFailure {
            error: "timeout".to_string(),
            retry_count: 0,
        }
    );
    assert_eq!(
        update.metadata.get("tool_event"),
        Some(&json!("execution_failed"))
    );
}

#[test]
fn test_complete_tool_execution_transitions_state() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    context.current_state = ContextState::ProcessingLLMResponse;
    context.begin_tool_execution("read_file", 1, None);

    let update = context.complete_tool_execution();

    assert_eq!(context.current_state, ContextState::ProcessingToolResults);
    assert_eq!(
        update.metadata.get("tool_event"),
        Some(&json!("execution_completed"))
    );
}

#[test]
fn test_abort_streaming_response_transitions_to_failed() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());
    let (message_id, _initial) = context.begin_streaming_response();

    let updates = context.abort_streaming_response(message_id, "network error");
    assert_eq!(
        context.current_state,
        ContextState::Failed {
            error: "network error".to_string()
        }
    );
    assert_eq!(updates.len(), 1);

    if let Some(MessageUpdate::StatusChanged {
        message_id: update_id,
        old_status,
        new_status,
    }) = &updates[0].message_update
    {
        assert_eq!(*update_id, message_id);
        assert_eq!(old_status, "streaming");
        assert_eq!(new_status, "failed");
    } else {
        panic!("expected status changed update");
    }
}

#[test]
fn test_llm_snapshot_reflects_active_branch() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let updates = context
        .send_message(IncomingMessage::text("snapshot test"))
        .expect("message accepted");
    let _ = block_on(updates.collect::<Vec<_>>());

    context.set_active_branch_system_prompt(SystemPrompt {
        id: "prompt-1".to_string(),
        content: "You are a helpful assistant".to_string(),
    });

    let snapshot = context.llm_snapshot();

    assert_eq!(snapshot.model_id, "gpt-4");
    assert_eq!(snapshot.branch.name, "main");
    assert_eq!(snapshot.agent_role, context.config.agent_role);
    assert_eq!(snapshot.total_messages, 1);
    assert_eq!(snapshot.branch.messages.len(), 1);

    let node = &snapshot.branch.messages[0];
    assert_eq!(node.message.role, Role::User);
    let text = node
        .message
        .content
        .first()
        .and_then(|part| part.text_content())
        .expect("text content");
    assert_eq!(text, "snapshot test");

    let prompt = snapshot
        .branch
        .system_prompt
        .expect("system prompt present");
    assert_eq!(prompt.id, "prompt-1");
    assert_eq!(prompt.content, "You are a helpful assistant");
}

#[test]
fn test_prepare_llm_request_matches_snapshot() {
    let mut context = ChatContext::new(Uuid::new_v4(), "gpt-4".to_string(), "default".to_string());

    let updates = context
        .send_message(IncomingMessage::text("llm request"))
        .expect("message accepted");
    let _ = block_on(updates.collect::<Vec<_>>());

    context.set_active_branch_system_prompt(SystemPrompt {
        id: "prompt-2".to_string(),
        content: "Act as a code reviewer".to_string(),
    });

    let prepared: PreparedLlmRequest = context.prepare_llm_request();

    assert_eq!(prepared.model_id, "gpt-4");
    assert_eq!(prepared.branch_name, "main");
    assert_eq!(prepared.total_messages, 1);
    assert_eq!(prepared.messages.len(), 1);
    assert_eq!(
        prepared.branch_system_prompt.as_ref().unwrap().id,
        "prompt-2"
    );
    assert_eq!(prepared.messages[0].role, Role::User);
    let text = prepared.messages[0]
        .content
        .first()
        .and_then(|part| part.text_content())
        .expect("text content");
    assert_eq!(text, "llm request");
}
