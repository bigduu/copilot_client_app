/*
#![allow(dead_code)]

use actix_web::{test, web, App, HttpResponse};
use copilot_client::test_utils::MockCopilotClient;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;
use uuid::Uuid;

use context_manager::structs::{
    message::{ContentPart, InternalMessage, Role},
    tool::{ToolCallRequest, ToolCallResult},
};
use web_service::{
    server::AppState,
    services::{chat_service::ChatService, session_manager::ChatSessionManager},
    storage::file_provider::FileStorageProvider,
};

// --- Mock Implementations ---

#[derive(Clone)]
struct MockToolExecutor;

impl MockToolExecutor {
    fn new() -> Self {
        Self
    }

    async fn execute(
        &self,
        _tool_name: &str,
        _args: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({"status": "sunny"}))
    }
}

// --- Test Setup ---

async fn setup_test_environment() -> (test::TestServer, Arc<AppState>, TempDir) {
    let temp_dir = tempfile::tempdir().unwrap();
    let storage_provider = Arc::new(FileStorageProvider::new(temp_dir.path().to_path_buf()));
    let session_manager = Arc::new(ChatSessionManager::new(storage_provider, 10));
    let copilot_client = Arc::new(MockCopilotClient::new());
    let tool_executor = Arc::new(MockToolExecutor::new());

    let chat_service = Arc::new(ChatService::new(
        session_manager.clone(),
        copilot_client.clone(),
        tool_executor.clone(),
    ));

    let app_state = Arc::new(AppState {
        chat_service: chat_service.clone(),
        session_manager: session_manager.clone(),
    });

    let server = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .route("/chat", web::post().to(web_service::controllers::chat_controller::create_chat_session))
            .route("/chat/{session_id}", web::post().to(web_service::controllers::chat_controller::handle_user_message))
            .route("/chat/{session_id}/approve", web::post().to(web_service::controllers::chat_controller::approve_tool_calls)),
    )
    .await;

    (server, app_state, temp_dir)
}

// --- Test Cases ---

#[actix_web::test]
async fn test_happy_path_conversation() {
    let (srv, app_state, _temp_dir) = setup_test_environment().await;

    // 1. Create a new chat session
    let req_create = test::TestRequest::post().uri("/chat").to_request();
    let resp_create: web_service::models::ChatSession = test::call_and_read_body_json(&srv, req_create).await;
    let session_id = resp_create.session_id;

    // 2. Configure mock LLM to return a final answer
    let mock_client = app_state.chat_service.get_copilot_client().downcast_arc::<MockCopilotClient>().unwrap();
    let final_answer = "Hello from the mock LLM!";
    mock_client.set_next_response(Ok(InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text(final_answer)],
        ..Default::default()
    }));

    // 3. Send a user message
    let user_message = serde_json::json!({"content": "Hello, world!"});
    let req_message = test::TestRequest::post()
        .uri(&format!("/chat/{}", session_id))
        .set_json(&user_message)
        .to_request();

    let resp_message = test::call_service(&srv, req_message).await;
    assert_eq!(resp_message.status(), 200);

    let body: serde_json::Value = test::read_body_json(resp_message).await;
    assert_eq!(body["role"], "assistant");
    assert_eq!(body["content"][0]["text"], final_answer);

    // 4. Verify persistence
    let context = app_state.session_manager.load_context(session_id).await.unwrap().unwrap();
    let context_lock = context.lock().await;
    assert_eq!(context_lock.get_messages("main").len(), 2); // User + Assistant
}

#[actix_web::test]
async fn test_tool_call_and_approval_flow() {
    let (srv, app_state, _temp_dir) = setup_test_environment().await;

    // 1. Create session
    let req_create = test::TestRequest::post().uri("/chat").to_request();
    let resp_create: web_service::models::ChatSession = test::call_and_read_body_json(&srv, req_create).await;
    let session_id = resp_create.session_id;

    // 2. Configure mock LLM for tool call
    let mock_client = app_state.chat_service.get_copilot_client().downcast_arc::<MockCopilotClient>().unwrap();
    let tool_call_id = Uuid::new_v4().to_string();
    let tool_call_request = ToolCallRequest::new(
        tool_call_id.clone(),
        "get_weather".to_string(),
        serde_json::json!({"location": "London"}),
    );
    mock_client.set_next_response(Ok(InternalMessage {
        role: Role::Assistant,
        tool_calls: Some(vec![tool_call_request.clone()]),
        ..Default::default()
    }));

    // 3. Send user message to trigger tool call
    let user_message = serde_json::json!({"content": "What's the weather in London?"});
    let req_message = test::TestRequest::post()
        .uri(&format!("/chat/{}", session_id))
        .set_json(&user_message)
        .to_request();

    let resp_tool_call = test::call_service(&srv, req_message).await;
    assert_eq!(resp_tool_call.status(), 202); // Accepted for approval

    let body: serde_json::Value = test::read_body_json(resp_tool_call).await;
    assert_eq!(body["tool_calls"][0]["id"], tool_call_id);

    // 4. Configure mock LLM for final answer after tool result
    let final_answer = "After checking, it is sunny in London.";
    mock_client.set_next_response(Ok(InternalMessage {
        role: Role::Assistant,
        content: vec![ContentPart::text(final_answer)],
        ..Default::default()
    }));

    // 5. Approve the tool call
    let approval_body = serde_json::json!({ "approved_tool_calls": [tool_call_id] });
    let req_approve = test::TestRequest::post()
        .uri(&format!("/chat/{}/approve", session_id))
        .set_json(&approval_body)
        .to_request();

    let resp_final = test::call_service(&srv, req_approve).await;
    assert_eq!(resp_final.status(), 200);

    let final_body: serde_json::Value = test::read_body_json(resp_final).await;
    assert_eq!(final_body["content"][0]["text"], final_answer);

    // 6. Verify persistence
    let context = app_state.session_manager.load_context(session_id).await.unwrap().unwrap();
    let context_lock = context.lock().await;
    let messages = context_lock.get_messages("main");
    assert_eq!(messages.len(), 4); // User, Assistant (tool), Tool, Assistant (final)
    assert_eq!(messages[2].role, Role::Tool);
}

#[actix_web::test]
async fn test_persistence_and_caching() {
    let (srv, app_state, temp_dir) = setup_test_environment().await;

    // 1. Create session and have a conversation turn
    let req_create = test::TestRequest::post().uri("/chat").to_request();
    let resp_create: web_service::models::ChatSession = test::call_and_read_body_json(&srv, req_create).await;
    let session_id = resp_create.session_id;

    let mock_client = app_state.chat_service.get_copilot_client().downcast_arc::<MockCopilotClient>().unwrap();
    mock_client.set_next_response(Ok(InternalMessage::new_assistant_message("Response 1")));

    let user_message1 = serde_json::json!({"content": "Message 1"});
    let req_message1 = test::TestRequest::post()
        .uri(&format!("/chat/{}", session_id))
        .set_json(&user_message1)
        .to_request();
    let resp1 = test::call_service(&srv, req_message1).await;
    assert!(resp1.status().is_success());

    // 2. "Restart" the service by creating a new session manager pointing to the same directory
    // This simulates clearing the in-memory cache and forcing a load from disk.
    let storage_provider = Arc::new(FileStorageProvider::new(temp_dir.path().to_path_buf()));
    let new_session_manager = Arc::new(ChatSessionManager::new(storage_provider, 10));

    // Ensure the context is not in the new cache
    assert!(new_session_manager.load_context_from_cache(session_id).is_none());

    // 3. Send a second message to the same session
    let new_chat_service = Arc::new(ChatService::new(
        new_session_manager.clone(),
        app_state.chat_service.get_copilot_client().clone(),
        app_state.chat_service.get_tool_executor().clone(),
    ));
    let new_app_state = Arc::new(AppState {
        chat_service: new_chat_service,
        session_manager: new_session_manager,
    });
    let new_srv = test::init_service(
        App::new()
            .app_data(web::Data::new(new_app_state.clone()))
            .route("/chat/{session_id}", web::post().to(web_service::controllers::chat_controller::handle_user_message))
    ).await;

    mock_client.set_next_response(Ok(InternalMessage::new_assistant_message("Response 2")));

    let user_message2 = serde_json::json!({"content": "Message 2"});
    let req_message2 = test::TestRequest::post()
        .uri(&format!("/chat/{}", session_id))
        .set_json(&user_message2)
        .to_request();

    let resp2 = test::call_service(&new_srv, req_message2).await;
    assert!(resp2.status().is_success());

    // 4. Verify the context was loaded and continued
    let context = new_app_state.session_manager.load_context(session_id).await.unwrap().unwrap();
    let context_lock = context.lock().await;
    let messages = context_lock.get_messages("main");
    assert_eq!(messages.len(), 4); // User1, Assistant1, User2, Assistant2
    assert_eq!(messages[0].content[0].text_content().unwrap(), "Message 1");
    assert_eq!(messages[1].content[0].text_content().unwrap(), "Response 1");
    assert_eq!(messages[2].content[0].text_content().unwrap(), "Message 2");
    assert_eq!(messages[3].content[0].text_content().unwrap(), "Response 2");
}
*/
