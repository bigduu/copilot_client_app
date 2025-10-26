#![allow(unused_imports)]
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use uuid::Uuid;

// Crate-local imports
use web_service::server::AppState;
use context_manager::{
    structs::{
        branch::Branch,
        context::{ChatContext, ChatConfig},
        message::{InternalMessage, Role, ContentPart, MessageNode},
        state::ContextState,
        tool::{ToolCallRequest, ApprovalStatus, ToolCallResult},
    },
    // No enhancer needed for this test
};
use tool_system::{
    registry::ToolRegistry,
    types::{Tool, ToolDefinition, ToolArguments, ToolError, ToolType, DisplayPreference, Parameter},
    executor::ToolExecutor,
};
use async_trait::async_trait;
use serde_json::json;

// --- Mock Tools for Testing ---

#[derive(Clone, Debug)]
struct MockWeatherTool;

#[async_trait]
impl Tool for MockWeatherTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "get_weather".to_string(),
            description: "Gets the weather for a location.".to_string(),
            parameters: vec![Parameter {
                name: "location".to_string(),
                description: "The location to get the weather for.".to_string(),
                required: true,
            }],
            requires_approval: true,
            tool_type: ToolType::AIParameterParsing,
            parameter_regex: None,
            custom_prompt: None,
            hide_in_selector: false,
            display_preference: DisplayPreference::Default,
        }
    }

    async fn execute(&self, args: ToolArguments) -> Result<serde_json::Value, ToolError> {
        if let ToolArguments::Json(params) = args {
            if let Some(location) = params.get("location").and_then(|v| v.as_str()) {
                Ok(json!({ "weather": format!("Sunny in {}", location) }))
            } else {
                Err(ToolError::InvalidArguments("Missing location".to_string()))
            }
        } else {
            Err(ToolError::InvalidArguments("Invalid argument format".to_string()))
        }
    }
}

// --- Test Setup ---

fn setup_test_environment() -> (Arc<AppState>, ChatContext) {
    let (tx, _rx) = mpsc::channel(100);
    let mut registry = ToolRegistry::new();
    // Note: The current registry design doesn't support dynamic registration for tests easily.
    // This test will rely on tools registered at compile time if any, or this mock tool.
    // For a real scenario, a test-specific registry setup would be needed.
    
    let app_state = Arc::new(AppState {
        conversations: Mutex::new(HashMap::new()),
        tool_registry: Arc::new(Mutex::new(registry)),
        tool_executor: Arc::new(ToolExecutor::new(Arc::new(Mutex::new(ToolRegistry::new())))),
        event_sender: tx,
    });

    let chat_id = Uuid::new_v4();
    let context = ChatContext::new(chat_id, "test_model".to_string(), "test_mode".to_string());
    app_state.conversations.lock().unwrap().insert(chat_id, context.clone());

    (app_state, context)
}

// --- Test Scenarios ---

#[tokio::test]
async fn test_scenario_standard_conversation_turn() {
    // 1. Setup
    let (app_state, mut context) = setup_test_environment();
    let chat_id = context.id;

    // 2. Simulate user message
    let user_message = "Hello, world!";
    let msg = InternalMessage {
        role: Role::User,
        content: vec![ContentPart::text(user_message)],
        ..Default::default()
    };
    context.add_message_to_branch("main", msg);
    
    // This test verifies that a message can be added.
    let updated_context = context.clone();
    app_state.conversations.lock().unwrap().insert(chat_id, updated_context);

    let final_context = app_state.conversations.lock().unwrap().get(&chat_id).unwrap().clone();
    let branch = final_context.get_active_branch().unwrap();
    assert_eq!(branch.message_ids.len(), 1);
    let message_id = branch.message_ids[0];
    let message_node = final_context.message_pool.get(&message_id).unwrap();
    assert_eq!(message_node.message.role, Role::User);
    assert_eq!(message_node.message.content[0].text_content().unwrap(), user_message);
}

#[tokio::test]
async fn test_scenario_full_tool_call_lifecycle() {
    // 1. Setup
    let (app_state, mut context) = setup_test_environment();
    let chat_id = context.id;
    
    // 2. Simulate LLM response with a tool call request
    let tool_call_id = "tool_call_123";
    let llm_message = InternalMessage {
        role: Role::Assistant,
        content: vec![],
        tool_calls: Some(vec![ToolCallRequest {
            id: tool_call_id.to_string(),
            tool_name: "get_weather".to_string(),
            arguments: ToolArguments::Json(json!({"location": "London"})),
            approval_status: ApprovalStatus::Pending,
        }]),
        ..Default::default()
    };
    context.add_message_to_branch("main", llm_message);
    context.current_state = ContextState::AwaitingToolApproval;
    
    app_state.conversations.lock().unwrap().insert(chat_id, context);

    // 3. Verify state is AwaitingToolApproval
    let current_context = app_state.conversations.lock().unwrap().get(&chat_id).unwrap().clone();
    assert!(matches!(current_context.current_state, ContextState::AwaitingToolApproval));
    
    // 4. Simulate User Approval
    let mut locked_conversations = app_state.conversations.lock().unwrap();
    let context_to_update = locked_conversations.get_mut(&chat_id).unwrap();
    
    let last_message_id = context_to_update.get_active_branch().unwrap().message_ids.last().unwrap().clone();
    let assistant_message_node = context_to_update.message_pool.get_mut(&last_message_id).unwrap();
    
    if let Some(tool_calls) = &mut assistant_message_node.message.tool_calls {
        tool_calls[0].approval_status = ApprovalStatus::Approved;
    }
    context_to_update.current_state = ContextState::ExecutingTools;

    // 5. Verify state transitions to ExecutingTools
    assert!(matches!(context_to_update.current_state, ContextState::ExecutingTools));
    
    // 6. Simulate Tool Execution (simplified)
    let tool_result_message = InternalMessage {
        role: Role::Tool,
        content: vec![],
        tool_result: Some(ToolCallResult {
            request_id: tool_call_id.to_string(),
            result: json!({ "weather": "Sunny in London" }),
        }),
        ..Default::default()
    };
    context_to_update.add_message_to_branch("main", tool_result_message);
    context_to_update.current_state = ContextState::ProcessingToolResults;

    // 7. Verify tool result is added and state is correct
    let final_context = context_to_update.clone();
    assert!(matches!(final_context.current_state, ContextState::ProcessingToolResults));
    let branch = final_context.get_active_branch().unwrap();
    assert_eq!(branch.message_ids.len(), 2);
    let last_message_id = branch.message_ids.last().unwrap();
    let tool_message_node = final_context.message_pool.get(last_message_id).unwrap();
    assert_eq!(tool_message_node.message.role, Role::Tool);
    assert_eq!(tool_message_node.message.tool_result.as_ref().unwrap().request_id, tool_call_id);
}

#[tokio::test]
async fn test_scenario_denied_tool_call() {
    // 1. Setup
    let (app_state, mut context) = setup_test_environment();
    let chat_id = context.id;
    
    // 2. Simulate LLM response with a tool call request
    let tool_call_id = "tool_call_456";
    let llm_message = InternalMessage {
        role: Role::Assistant,
        content: vec![],
        tool_calls: Some(vec![ToolCallRequest {
            id: tool_call_id.to_string(),
            tool_name: "get_weather".to_string(),
            arguments: ToolArguments::Json(json!({"location": "Paris"})),
            approval_status: ApprovalStatus::Pending,
        }]),
        ..Default::default()
    };
    context.add_message_to_branch("main", llm_message);
    context.current_state = ContextState::AwaitingToolApproval;
    app_state.conversations.lock().unwrap().insert(chat_id, context);

    // 3. Simulate User Denial
    let mut locked_conversations = app_state.conversations.lock().unwrap();
    let context_to_update = locked_conversations.get_mut(&chat_id).unwrap();
    let last_message_id = context_to_update.get_active_branch().unwrap().message_ids.last().unwrap().clone();
    let assistant_message_node = context_to_update.message_pool.get_mut(&last_message_id).unwrap();
    
    if let Some(tool_calls) = &mut assistant_message_node.message.tool_calls {
        tool_calls[0].approval_status = ApprovalStatus::Denied;
    }
    context_to_update.current_state = ContextState::GeneratingResponse;

    // 4. Verify state and message status
    let final_context = context_to_update.clone();
    assert!(matches!(final_context.current_state, ContextState::GeneratingResponse));
    let branch = final_context.get_active_branch().unwrap();
    let final_message_id = branch.message_ids.last().unwrap();
    let final_message_node = final_context.message_pool.get(final_message_id).unwrap();
    let tool_call = &final_message_node.message.tool_calls.as_ref().unwrap()[0];
    assert_eq!(tool_call.approval_status, ApprovalStatus::Denied);
}