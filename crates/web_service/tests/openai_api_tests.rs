use actix_http::Request;
use actix_web::{
    dev::{Service, ServiceResponse},
    test, App, Error,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use bytes::Bytes;
use copilot_client::{
    api::models::{
        ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStreamChunk, ChatMessage,
        Content, ResponseChoice, Role, StreamChoice, StreamDelta, Usage,
    },
    client_trait::CopilotClientTrait,
};
use futures_util::StreamExt;
use reqwest::Response;
use reqwest_sse::EventSource;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc::Sender;
use web_service::server::{app_config, AppState};
use wiremock::{
    matchers::{method, path},
    Mock, MockServer, ResponseTemplate,
};

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

struct MockCopilotClient {
    mock_server_uri: String,
    client: reqwest::Client,
}

#[async_trait]
impl CopilotClientTrait for MockCopilotClient {
    async fn send_chat_completion_request(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<Response> {
        let url = format!("{}/chat/completions", self.mock_server_uri);
        let res = self.client.post(&url).json(&request).send().await?;
        Ok(res)
    }

    async fn process_chat_completion_stream(
        &self,
        response: Response,
        tx: Sender<Result<Bytes>>,
    ) -> Result<()> {
        let mut event_stream = response.events().await.map_err(|e| anyhow!(e))?;
        while let Some(event_result) = event_stream.next().await {
            match event_result {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        let _ = tx.send(Ok(Bytes::from("[DONE]"))).await;
                        break;
                    }
                    match serde_json::from_str::<ChatCompletionStreamChunk>(&event.data) {
                        Ok(chunk) => {
                            let vec = serde_json::to_vec(&chunk)?;
                            if tx.send(Ok(Bytes::from(vec))).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => {
                            if tx.send(Ok(Bytes::from(event.data.clone()))).await.is_err() {
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(anyhow!("Error in SSE stream: {}", e))).await;
                    break;
                }
            }
        }
        Ok(())
    }
}

async fn setup_test_environment() -> (
    impl Service<Request, Response = ServiceResponse, Error = Error>,
    MockServer,
) {
    // Start a mock server
    let mock_server = MockServer::start().await;

    let copilot_client = Arc::new(MockCopilotClient {
        mock_server_uri: mock_server.uri(),
        client: reqwest::Client::new(),
    });

    let app_state = actix_web::web::Data::new(AppState {
        session_manager: Arc::new(
            web_service::services::session_manager::ChatSessionManager::new(
                Arc::new(
                    web_service::storage::file_provider::FileStorageProvider::new(
                        "test_conversations",
                    ),
                ),
                10,
            ),
        ),
        copilot_client: copilot_client.clone(),
        tool_executor: Arc::new(tool_system::ToolExecutor::new(Arc::new(
            std::sync::Mutex::new(tool_system::registry::ToolRegistry::new()),
        ))),
    });

    let app =
        test::init_service(App::new().app_data(app_state.clone()).configure(app_config)).await;
    (app, mock_server)
}

#[actix_web::test]
async fn test_get_models() {
    let (app, mock_server) = setup_test_environment().await;

    let expected_models = vec![
        Model {
            id: "gpt-4".to_string(),
            object: "model".to_string(),
            created: 1677610602,
            owned_by: "openai".to_string(),
        },
        Model {
            id: "gpt-3.5-turbo".to_string(),
            object: "model".to_string(),
            created: 1677610602,
            owned_by: "openai".to_string(),
        },
    ];
    let response_body = ListModelsResponse {
        object: "list".to_string(),
        data: expected_models.clone(),
    };

    Mock::given(method("GET"))
        .and(path("/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    let req = test::TestRequest::get().uri("/v1/models").to_request();
    let resp: ListModelsResponse = test::call_and_read_body_json(&app, req).await;

    assert_eq!(resp.object, "list");
    assert_eq!(resp.data, expected_models);
}

#[actix_web::test]
async fn test_chat_completions_non_streaming() {
    let (app, mock_server) = setup_test_environment().await;

    let expected_completion = ChatCompletionResponse {
        id: "chatcmpl-123".to_string(),
        object: "chat.completion".to_string(),
        created: 1677652288,
        model: "gpt-3.5-turbo-0125".to_string(),
        choices: vec![ResponseChoice {
            index: 0,
            message: ChatMessage {
                role: Role::Assistant,
                content: Content::Text("\n\nHello there, how may I assist you today?".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            finish_reason: "stop".to_string(),
        }],
        usage: Usage {
            prompt_tokens: 9,
            completion_tokens: 12,
            total_tokens: 21,
        },
        system_fingerprint: Some("fp_44709d6fcb".to_string()),
    };

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&expected_completion))
        .mount(&mock_server)
        .await;

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

    assert_eq!(resp, expected_completion);
}

#[actix_web::test]
async fn test_chat_completions_streaming() {
    let (app, mock_server) = setup_test_environment().await;

    // 1. Define the stream chunks
    let chunks = vec![
        ChatCompletionStreamChunk {
            id: "chatcmpl-123".to_string(),
            object: "chat.completion.chunk".to_string(),
            created: 1677652288,
            model: "gpt-3.5-turbo-0125".to_string(),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: Some(Role::Assistant),
                    content: None,
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-123".to_string(),
            object: "chat.completion.chunk".to_string(),
            created: 1677652288,
            model: "gpt-3.5-turbo-0125".to_string(),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: Some("Hello".to_string()),
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-123".to_string(),
            object: "chat.completion.chunk".to_string(),
            created: 1677652288,
            model: "gpt-3.5-turbo-0125".to_string(),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: Some(" there!".to_string()),
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-123".to_string(),
            object: "chat.completion.chunk".to_string(),
            created: 1677652288,
            model: "gpt-3.5-turbo-0125".to_string(),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: None,
                    tool_calls: None,
                },
                finish_reason: Some("stop".to_string()),
            }],
        },
    ];

    // 2. Construct the SSE response body
    let mut sse_body = String::new();
    for chunk in &chunks {
        let chunk_json = serde_json::to_string(chunk).unwrap();
        sse_body.push_str(&format!("data: {}\n\n", chunk_json));
    }
    sse_body.push_str("data: [DONE]\n\n");

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(sse_body)
                .insert_header("Content-Type", "text/event-stream"),
        )
        .mount(&mock_server)
        .await;

    // 3. Create and send the request
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

    // 4. Assert the response
    assert!(res.status().is_success());
    assert_eq!(
        res.headers().get("Content-Type").unwrap(),
        "text/event-stream"
    );

    let body_bytes = test::read_body(res).await;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    // Manually parse the SSE events.
    let received_chunks: Vec<ChatCompletionStreamChunk> = body_str
        .trim()
        .split("\n\n")
        .filter_map(|event| event.strip_prefix("data: "))
        .filter(|data| *data != "[DONE]")
        .map(|data| serde_json::from_str(data).unwrap())
        .collect();

    assert_eq!(received_chunks, chunks);
}
