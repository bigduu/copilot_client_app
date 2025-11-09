/// HTTP API Integration Tests for Signal-Pull Architecture
///
/// These tests verify that the HTTP endpoints work correctly with the actual backend:
/// - Endpoint paths are correct
/// - Request/response formats match frontend expectations
/// - Complete Signal-Pull flow works end-to-end
use actix_http::Request;
use actix_web::{
    dev::{Service, ServiceResponse},
    test, App, Error,
};
use async_trait::async_trait;
use bytes::Bytes;
use copilot_client::{
    api::models::{ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStreamChunk},
    client_trait::CopilotClientTrait,
};
use reqwest::Response;
use serde_json::json;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::mpsc::Sender;
use tool_system::{registry::ToolRegistry, ToolExecutor};
use uuid::Uuid;
use web_service::server::{app_config, AppState};
use web_service::services::{
    approval_manager::ApprovalManager, session_manager::ChatSessionManager,
    system_prompt_enhancer::SystemPromptEnhancer, system_prompt_service::SystemPromptService,
    template_variable_service::TemplateVariableService,
    user_preference_service::UserPreferenceService, workflow_service::WorkflowService,
};
use wiremock::{
    matchers::{method, path},
    Mock, MockServer, ResponseTemplate,
};
use workflow_system::WorkflowRegistry;

/// Mock Copilot Client for testing
struct MockCopilotClient {
    mock_server: Arc<Mutex<Option<MockServer>>>,
    client: reqwest::Client,
}

impl MockCopilotClient {
    fn new() -> Self {
        Self {
            mock_server: Arc::new(Mutex::new(None)),
            client: reqwest::Client::new(),
        }
    }

    async fn init_mock_server(&self) {
        let server = MockServer::start().await;

        // Setup mock response for chat completions
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(""))
            .mount(&server)
            .await;

        *self.mock_server.lock().unwrap() = Some(server);
    }

    fn get_server_uri(&self) -> String {
        self.mock_server
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| s.uri())
            .unwrap_or_else(|| "http://localhost:1".to_string())
    }
}

#[async_trait]
impl CopilotClientTrait for MockCopilotClient {
    async fn send_chat_completion_request(
        &self,
        request: ChatCompletionRequest,
    ) -> anyhow::Result<Response> {
        // Send request to mock server
        let url = format!("{}/chat/completions", self.get_server_uri());
        let res = self.client.post(&url).json(&request).send().await?;
        Ok(res)
    }

    async fn process_chat_completion_stream(
        &self,
        _response: Response,
        tx: Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        // Send mock streaming chunks in the correct format
        let chunks = vec!["This is ", "a mock ", "LLM response ", "for testing."];

        for chunk_text in chunks {
            let chunk = ChatCompletionStreamChunk {
                id: "chatcmpl-test".to_string(),
                object: Some("chat.completion.chunk".to_string()),
                created: 1234567890,
                model: Some("gpt-4".to_string()),
                choices: vec![copilot_client::api::models::StreamChoice {
                    index: 0,
                    delta: copilot_client::api::models::StreamDelta {
                        role: None,
                        content: Some(chunk_text.to_string()),
                        tool_calls: None,
                    },
                    finish_reason: None,
                }],
            };

            let chunk_json = serde_json::to_vec(&chunk)?;
            tx.send(Ok(Bytes::from(chunk_json))).await.ok();
        }

        // Send [DONE] signal
        tx.send(Ok(Bytes::from("[DONE]"))).await.ok();
        Ok(())
    }
}

/// Setup test environment with AppState
async fn setup_test_app() -> impl Service<Request, Response = ServiceResponse, Error = Error> {
    let temp_dir = tempfile::TempDir::new().unwrap();
    let conversations_path = temp_dir.path().join("conversations");
    std::fs::create_dir_all(&conversations_path).unwrap();

    let copilot_client = Arc::new(MockCopilotClient::new());
    copilot_client.init_mock_server().await;
    let system_prompt_service = Arc::new(SystemPromptService::new(PathBuf::from(
        "test_system_prompts",
    )));
    let template_variable_service = Arc::new(TemplateVariableService::new(PathBuf::from(
        "test_template_variables",
    )));
    let system_prompt_enhancer = Arc::new(
        SystemPromptEnhancer::with_default_config(Arc::new(ToolRegistry::new()))
            .with_template_service(template_variable_service.clone()),
    );
    let session_manager = Arc::new(ChatSessionManager::new(
        Arc::new(
            web_service::storage::file_provider::FileStorageProvider::new(
                conversations_path.to_str().unwrap(),
            ),
        ),
        10,
    ));
    let tool_registry = Arc::new(Mutex::new(ToolRegistry::new()));
    let tool_executor = Arc::new(ToolExecutor::new(tool_registry));
    let approval_manager = Arc::new(ApprovalManager::new());
    let user_preference_service = Arc::new(UserPreferenceService::new(PathBuf::from(
        "test_user_preferences",
    )));
    let workflow_service = Arc::new(WorkflowService::new(Arc::new(WorkflowRegistry::new())));

    let app_state = actix_web::web::Data::new(AppState {
        system_prompt_service,
        system_prompt_enhancer,
        session_manager,
        copilot_client,
        tool_executor,
        template_variable_service,
        approval_manager,
        user_preference_service,
        workflow_service,
    });

    test::init_service(App::new().app_data(app_state.clone()).configure(app_config)).await
}

/// Helper: Create a test context
async fn create_test_context(
    app: &impl Service<Request, Response = ServiceResponse, Error = Error>,
) -> Uuid {
    let req = test::TestRequest::post()
        .uri("/v1/contexts")
        .set_json(&json!({
            "model_id": "gpt-4",
            "mode": "code"
        }))
        .to_request();

    let resp: serde_json::Value = test::call_and_read_body_json(app, req).await;
    let context_id = resp["id"].as_str().unwrap();
    Uuid::parse_str(context_id).unwrap()
}

// ============================================================================
// Test 1: SSE Subscription Endpoint
// ============================================================================

#[actix_web::test]
async fn test_sse_subscription_endpoint() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;

    // Test: Subscribe to SSE
    let req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/events", context_id))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Verify: Status 200, Content-Type text/event-stream
    assert_eq!(resp.status(), 200);
    let content_type = resp.headers().get("content-type").unwrap();
    assert!(content_type.to_str().unwrap().contains("text/event-stream"));
}

#[actix_web::test]
async fn test_sse_endpoint_404_for_nonexistent_context() {
    let app = setup_test_app().await;
    let nonexistent_id = Uuid::new_v4();

    let req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/events", nonexistent_id))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Verify: Status 404
    assert_eq!(resp.status(), 404);
}

// ============================================================================
// Test 2: Send Message Endpoint
// ============================================================================

#[actix_web::test]
async fn test_send_message_endpoint() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;

    // Test: Send message
    let req = test::TestRequest::post()
        .uri(&format!("/v1/contexts/{}/actions/send_message", context_id))
        .set_json(&json!({
            "payload": {
                "type": "text",
                "content": "Hello, world!"
            }
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Debug: Print response status and body if not 200
    let status = resp.status();
    if status != 200 {
        let body: serde_json::Value = test::read_body_json(resp).await;
        eprintln!("❌ test_send_message_endpoint failed:");
        eprintln!("   Status: {}", status);
        eprintln!("   Body: {}", serde_json::to_string_pretty(&body).unwrap());
        panic!("Expected status 200, got {}", status);
    }

    // Verify: Status 200
    assert_eq!(status, 200);

    // Verify: Response format (ActionResponse)
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["status"].is_string());
    assert!(body["context"].is_object());
}

#[actix_web::test]
async fn test_send_message_validation() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;

    // Test: Send message with missing content
    let req = test::TestRequest::post()
        .uri(&format!("/v1/contexts/{}/actions/send_message", context_id))
        .set_json(&json!({
            "payload": {
                "type": "text"
                // Missing "content" field
            }
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Verify: Status 400 (Bad Request)
    assert_eq!(resp.status(), 400);
}

#[actix_web::test]
async fn test_send_message_404_for_nonexistent_context() {
    let app = setup_test_app().await;
    let nonexistent_id = Uuid::new_v4();

    let req = test::TestRequest::post()
        .uri(&format!(
            "/v1/contexts/{}/actions/send_message",
            nonexistent_id
        ))
        .set_json(&json!({
            "payload": {
                "type": "text",
                "content": "Hello"
            }
        }))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Debug: Print response status and body if not 404
    let status = resp.status();
    if status != 404 {
        let body: serde_json::Value = test::read_body_json(resp).await;
        eprintln!("❌ test_send_message_404_for_nonexistent_context failed:");
        eprintln!("   Expected: 404");
        eprintln!("   Got: {}", status);
        eprintln!("   Body: {}", serde_json::to_string_pretty(&body).unwrap());
        panic!("Expected status 404, got {}", status);
    }

    // Verify: Status 404
    assert_eq!(status, 404);
}

// ============================================================================
// Test 3: Streaming Chunks Endpoint
// ============================================================================

#[actix_web::test]
async fn test_streaming_chunks_endpoint() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;

    // First, send a message using the action endpoint (which triggers FSM)
    let send_msg_req = test::TestRequest::post()
        .uri(&format!("/v1/contexts/{}/actions/send_message", context_id))
        .set_json(&json!({
            "payload": {
                "type": "text",
                "content": "Test message for streaming"
            }
        }))
        .to_request();
    let _send_resp: serde_json::Value = test::call_and_read_body_json(&app, send_msg_req).await;

    // Get messages from the context using the messages endpoint
    let get_messages_req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/messages", context_id))
        .to_request();
    let messages_resp: serde_json::Value =
        test::call_and_read_body_json(&app, get_messages_req).await;

    // Find the assistant message (should be the last one)
    let messages = messages_resp["messages"]
        .as_array()
        .expect("messages should be an array");

    println!("=== All messages ===");
    for (i, msg) in messages.iter().enumerate() {
        println!(
            "Message {}: role={}, id={}, type={:?}",
            i,
            msg["role"].as_str().unwrap_or("unknown"),
            msg["id"].as_str().unwrap_or("unknown"),
            msg["message_type"]
        );

        // Print content structure
        if let Some(content) = msg.get("content") {
            println!("  Content type: {:?}", content);
        }
    }

    let assistant_message = messages
        .iter()
        .find(|msg| msg["role"].as_str() == Some("assistant"))
        .expect("Should have an assistant message");
    let message_id = assistant_message["id"].as_str().unwrap();

    println!("=== Assistant message ID: {} ===", message_id);

    // Test: Pull streaming chunks
    let req = test::TestRequest::get()
        .uri(&format!(
            "/v1/contexts/{}/messages/{}/streaming-chunks?from_sequence=0",
            context_id, message_id
        ))
        .to_request();

    let resp = test::call_service(&app, req).await;

    let status = resp.status();
    println!("=== Streaming chunks response status: {} ===", status);

    // Verify: Status 200
    if status != 200 {
        let body: serde_json::Value = test::read_body_json(resp).await;
        println!("=== Error response body ===");
        println!("{}", serde_json::to_string_pretty(&body).unwrap());
        panic!("Expected status 200, got {}", status);
    }

    assert_eq!(status, 200);

    // Verify: Response format
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["context_id"].as_str().unwrap(), context_id.to_string());
    assert_eq!(body["message_id"].as_str().unwrap(), message_id);
    assert!(body["chunks"].is_array());
    assert!(body["current_sequence"].is_number());
    assert!(body["has_more"].is_boolean());
}

#[actix_web::test]
async fn test_streaming_chunks_404_for_nonexistent_message() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;
    let nonexistent_msg_id = Uuid::new_v4();

    let req = test::TestRequest::get()
        .uri(&format!(
            "/v1/contexts/{}/messages/{}/streaming-chunks",
            context_id, nonexistent_msg_id
        ))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Verify: Status 404
    assert_eq!(resp.status(), 404);
}

// ============================================================================
// Test 4: Context Metadata Endpoint
// ============================================================================

#[actix_web::test]
async fn test_context_metadata_endpoint() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;

    let req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/metadata", context_id))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Verify: Status 200
    assert_eq!(resp.status(), 200);

    // Verify: Response format (ContextMetadataResponse)
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["id"].as_str().unwrap(), context_id.to_string());
    assert!(body["current_state"].is_string()); // Note: field is "current_state", not "state"
    assert!(body["active_branch_name"].is_string());
    assert!(body["message_count"].is_number());
    assert!(body["model_id"].is_string());
    assert!(body["mode"].is_string());
}

// ============================================================================
// Test 5: Context State Endpoint
// ============================================================================

#[actix_web::test]
async fn test_context_state_endpoint() {
    let app = setup_test_app().await;
    let context_id = create_test_context(&app).await;

    let req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/state", context_id))
        .to_request();

    let resp = test::call_service(&app, req).await;

    // Verify: Status 200
    assert_eq!(resp.status(), 200);

    // Verify: Response format (ActionResponse)
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["status"].is_string()); // Note: field is "status", not "state"
    assert!(body["context"].is_object());
    assert!(body["context"]["id"].is_string());
    assert!(body["context"]["current_state"].is_string());
}
