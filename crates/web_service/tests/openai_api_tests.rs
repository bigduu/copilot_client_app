use actix_http::Request;
use actix_web::{
    dev::{Service, ServiceResponse},
    test, web, App, Error,
};
use agent_llm::api::models::{
    ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStreamChunk, ChatMessage, Content,
    Role, Usage,
};
use agent_llm::{LLMChunk, LLMError, LLMProvider, LLMStream};
use async_trait::async_trait;
use futures_util::stream;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use agent_server::state::AppState as AgentAppState;
use chat_core::{Config, ProviderConfigs};
use web_service::server::{app_config, AppState};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct ListModelsResponse {
    object: String,
    data: Vec<Model>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
struct Model {
    id: String,
    object: String,
    created: u64,
    owned_by: String,
}

#[derive(Clone)]
struct MockProvider {
    models: Vec<String>,
    chunks: Vec<LLMChunk>,
}

#[async_trait]
impl LLMProvider for MockProvider {
    async fn chat_stream(
        &self,
        _messages: &[agent_core::Message],
        _tools: &[agent_core::tools::ToolSchema],
        _max_output_tokens: Option<u32>,
    ) -> Result<LLMStream, LLMError> {
        let items = self.chunks.clone().into_iter().map(Ok);
        Ok(Box::pin(stream::iter(items)))
    }

    async fn list_models(&self) -> Result<Vec<String>, LLMError> {
        Ok(self.models.clone())
    }
}

async fn setup_test_environment(
    provider: Arc<dyn LLMProvider>,
) -> (
    impl Service<Request, Response = ServiceResponse, Error = Error>,
    tempfile::TempDir,
) {
    let temp_dir = tempfile::tempdir().expect("tempdir");

    // Satisfy `has_valid_auth()` checks for /v1/models.
    std::fs::write(temp_dir.path().join(".token"), "test-token").expect("write .token");

    let config = Config {
        provider: "copilot".to_string(),
        providers: ProviderConfigs::default(),
        http_proxy: String::new(),
        https_proxy: String::new(),
        proxy_auth: None,
        model: None,
        headless_auth: false,
    };

    let app_state = web::Data::new(AppState {
        app_data_dir: temp_dir.path().to_path_buf(),
        provider: Arc::new(RwLock::new(provider)),
        config: Arc::new(RwLock::new(config)),
        metrics_bus: None,
    });

    // The OpenAI controller handler currently requires AgentAppState extraction
    // (even though it doesn't use it). Build a lightweight instance rooted in our temp dir.
    let agent_state = web::Data::new(
        AgentAppState::new_with_config(
            "openai",
            "http://127.0.0.1:0/v1".to_string(),
            "gpt-4o-mini".to_string(),
            "sk-test".to_string(),
            Some(temp_dir.path().to_path_buf()),
            true,
        )
        .await,
    );

    let app = test::init_service(
        App::new()
            .app_data(app_state.clone())
            .app_data(agent_state.clone())
            .configure(app_config),
    )
    .await;

    (app, temp_dir)
}

#[actix_web::test]
async fn test_get_models() {
    let provider: Arc<dyn LLMProvider> = Arc::new(MockProvider {
        models: vec!["gpt-4".to_string(), "gpt-3.5-turbo".to_string()],
        chunks: vec![],
    });
    let (app, _temp_dir) = setup_test_environment(provider).await;

    let expected_models = vec![
        Model {
            id: "gpt-4".to_string(),
            object: "model".to_string(),
            created: 1677610602,
            owned_by: "github-copilot".to_string(),
        },
        Model {
            id: "gpt-3.5-turbo".to_string(),
            object: "model".to_string(),
            created: 1677610602,
            owned_by: "github-copilot".to_string(),
        },
    ];

    let req = test::TestRequest::get().uri("/v1/models").to_request();
    let resp: ListModelsResponse = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp.object, "list");
    assert_eq!(resp.data, expected_models);
}

#[actix_web::test]
async fn test_chat_completions_non_streaming() {
    let expected_text = "\n\nHello there, how may I assist you today?";
    let provider: Arc<dyn LLMProvider> = Arc::new(MockProvider {
        models: vec![],
        chunks: vec![LLMChunk::Token(expected_text.to_string()), LLMChunk::Done],
    });
    let (app, _temp_dir) = setup_test_environment(provider).await;

    let req_body = ChatCompletionRequest {
        model: "gpt-4".to_string(),
        messages: vec![ChatMessage {
            role: Role::User,
            content: Content::Text("Hello".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }],
        stream: Some(false),
        ..Default::default()
    };

    let req = test::TestRequest::post()
        .uri("/v1/chat/completions")
        .set_json(&req_body)
        .to_request();

    let resp: ChatCompletionResponse = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp.object.as_deref(), Some("chat.completion"));
    assert_eq!(resp.model.as_deref(), Some("gpt-4"));
    assert_eq!(resp.choices.len(), 1);
    assert_eq!(resp.choices[0].message.role, Role::Assistant);
    assert_eq!(
        resp.choices[0].message.content,
        Content::Text(expected_text.to_string())
    );
    assert_eq!(resp.choices[0].finish_reason.as_deref(), Some("stop"));
    assert_eq!(
        resp.usage,
        Some(Usage {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        })
    );
}

#[actix_web::test]
async fn test_chat_completions_streaming() {
    let provider: Arc<dyn LLMProvider> = Arc::new(MockProvider {
        models: vec![],
        chunks: vec![
            LLMChunk::Token("Hello".to_string()),
            LLMChunk::Token(" there!".to_string()),
            LLMChunk::Done,
        ],
    });
    let (app, _temp_dir) = setup_test_environment(provider).await;

    let req_body = ChatCompletionRequest {
        model: "gpt-4".to_string(),
        messages: vec![ChatMessage {
            role: Role::User,
            content: Content::Text("Hello".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }],
        stream: Some(true),
        ..Default::default()
    };

    let req = test::TestRequest::post()
        .uri("/v1/chat/completions")
        .set_json(&req_body)
        .to_request();

    let res = test::call_service(&app, req).await;

    assert!(res.status().is_success());
    assert_eq!(res.headers().get("Content-Type").unwrap(), "text/event-stream");

    let body_bytes = test::read_body(res).await;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    let received: Vec<ChatCompletionStreamChunk> = body_str
        .split("\n\n")
        .filter_map(|event| event.trim().strip_prefix("data: "))
        .filter(|data| !data.trim().is_empty())
        .map(|data| serde_json::from_str(data).unwrap())
        .collect();

    assert_eq!(received.len(), 3);

    let mut content = String::new();
    for chunk in &received {
        assert_eq!(chunk.model.as_deref(), Some("gpt-4"));
        let choice = &chunk.choices[0];
        if let Some(text) = &choice.delta.content {
            content.push_str(text);
        }
    }

    assert_eq!(content, "Hello there!");
    assert_eq!(
        received.last().unwrap().choices[0].finish_reason.as_deref(),
        Some("stop")
    );
}

