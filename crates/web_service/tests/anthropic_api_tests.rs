use actix_http::Request;
use actix_web::{
    dev::{Service, ServiceResponse},
    test, App, Error,
};
use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;
use copilot_client::{
    api::models::{
        ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStreamChunk, ChatMessage,
        Content, ResponseChoice, Role, StreamChoice, StreamDelta, StreamFunctionCall,
        StreamToolCall, Usage,
    },
    client_trait::CopilotClientTrait,
};
use reqwest::Response;
use serde_json::{json, Value};
use std::{
    ffi::OsString,
    sync::{Arc, Mutex, OnceLock},
};
use tokio::sync::mpsc::Sender;
use web_service::server::{app_config, AppState};
use skill_manager::SkillManager;
use wiremock::{
    matchers::{body_partial_json, method, path},
    Mock, MockServer, ResponseTemplate,
};

struct HomeGuard {
    previous: Option<OsString>,
}

impl HomeGuard {
    fn new(path: &std::path::Path) -> Self {
        let previous = std::env::var_os("HOME");
        std::env::set_var("HOME", path);
        Self { previous }
    }
}

impl Drop for HomeGuard {
    fn drop(&mut self) {
        match &self.previous {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
    }
}

fn home_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
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
        let body = response.text().await?;

        for line in body.lines() {
            if line.starts_with("data: ") {
                let data = line.strip_prefix("data: ").unwrap().to_string();
                if data == "[DONE]" {
                    let _ = tx.send(Ok(Bytes::from("[DONE]"))).await;
                    break;
                }
                match serde_json::from_str::<ChatCompletionStreamChunk>(&data) {
                    Ok(chunk) => {
                        let vec = serde_json::to_vec(&chunk)?;
                        if tx.send(Ok(Bytes::from(vec))).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        if tx.send(Ok(Bytes::from(data))).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
        Ok(())
    }

    async fn get_models(&self) -> Result<Vec<String>> {
        Ok(vec!["gpt-4".to_string(), "gpt-3.5-turbo".to_string()])
    }
}

async fn setup_test_environment() -> (
    impl Service<Request, Response = ServiceResponse, Error = Error>,
    MockServer,
) {
    let mock_server = MockServer::start().await;

    let copilot_client = Arc::new(MockCopilotClient {
        mock_server_uri: mock_server.uri(),
        client: reqwest::Client::builder().no_proxy().build().unwrap(),
    });

    let skill_manager = SkillManager::new();
    skill_manager.initialize().await.expect("init skills");
    let app_state = actix_web::web::Data::new(AppState {
        copilot_client: copilot_client.clone(),
        app_data_dir: std::env::temp_dir(),
        skill_manager,
    });

    let app =
        test::init_service(App::new().app_data(app_state.clone()).configure(app_config)).await;
    (app, mock_server)
}

#[actix_web::test]
async fn test_messages_non_streaming() {
    let (app, mock_server) = setup_test_environment().await;

    let expected_completion = ChatCompletionResponse {
        id: "chatcmpl-123".to_string(),
        object: Some("chat.completion".to_string()),
        created: Some(1677652288),
        model: Some("gpt-3.5-turbo-0125".to_string()),
        choices: vec![ResponseChoice {
            index: 0,
            message: ChatMessage {
                role: Role::Assistant,
                content: Content::Text("Hello there".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            finish_reason: Some("stop".to_string()),
        }],
        usage: Some(Usage {
            prompt_tokens: 9,
            completion_tokens: 12,
            total_tokens: 21,
        }),
        system_fingerprint: None,
    };

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&expected_completion))
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "gpt-4",
        "max_tokens": 10,
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    });

    let req = test::TestRequest::post()
        .uri("/v1/messages")
        .set_json(&req_body)
        .to_request();

    let resp: Value = test::call_and_read_body_json(&app, req).await;

    let expected = json!({
        "id": "chatcmpl-123",
        "type": "message",
        "role": "assistant",
        "content": [
            {"type": "text", "text": "Hello there"}
        ],
        "model": "gpt-4",
        "stop_reason": "end_turn",
        "usage": {
            "input_tokens": 9,
            "output_tokens": 12
        }
    });

    assert_eq!(resp, expected);
}

#[actix_web::test]
async fn test_messages_missing_mapping_falls_back() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = tempfile::TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let (app, mock_server) = setup_test_environment().await;

    let expected_completion = ChatCompletionResponse {
        id: "chatcmpl-124".to_string(),
        object: Some("chat.completion".to_string()),
        created: Some(1677652288),
        model: Some("gpt-3.5-turbo-0125".to_string()),
        choices: vec![ResponseChoice {
            index: 0,
            message: ChatMessage {
                role: Role::Assistant,
                content: Content::Text("Fallback response".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            finish_reason: Some("stop".to_string()),
        }],
        usage: Some(Usage {
            prompt_tokens: 5,
            completion_tokens: 7,
            total_tokens: 12,
        }),
        system_fingerprint: None,
    };

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(body_partial_json(json!({ "model": "" })))
        .respond_with(ResponseTemplate::new(200).set_body_json(&expected_completion))
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "claude-3-5-sonnet",
        "max_tokens": 10,
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    });

    let req = test::TestRequest::post()
        .uri("/v1/messages")
        .set_json(&req_body)
        .to_request();

    let resp: Value = test::call_and_read_body_json(&app, req).await;

    let expected = json!({
        "id": "chatcmpl-124",
        "type": "message",
        "role": "assistant",
        "content": [
            {"type": "text", "text": "Fallback response"}
        ],
        "model": "claude-3-5-sonnet",
        "stop_reason": "end_turn",
        "usage": {
            "input_tokens": 5,
            "output_tokens": 7
        }
    });

    assert_eq!(resp, expected);
}

#[actix_web::test]
async fn test_messages_reasoning_is_mapped_to_reasoning_effort() {
    let _lock = home_lock().lock().unwrap();
    let temp_dir = tempfile::TempDir::new().unwrap();
    let _guard = HomeGuard::new(temp_dir.path());

    let (app, mock_server) = setup_test_environment().await;

    let expected_completion = ChatCompletionResponse {
        id: "chatcmpl-200".to_string(),
        object: Some("chat.completion".to_string()),
        created: Some(1677652288),
        model: Some("gpt-3.5-turbo-0125".to_string()),
        choices: vec![ResponseChoice {
            index: 0,
            message: ChatMessage {
                role: Role::Assistant,
                content: Content::Text("OK".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            finish_reason: Some("stop".to_string()),
        }],
        usage: Some(Usage {
            prompt_tokens: 5,
            completion_tokens: 1,
            total_tokens: 6,
        }),
        system_fingerprint: None,
    };

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&expected_completion))
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "claude-3-5-sonnet",
        "max_tokens": 10,
        "reasoning": "mid",
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    });

    let req = test::TestRequest::post()
        .uri("/v1/messages")
        .set_json(&req_body)
        .to_request();

    let _: Value = test::call_and_read_body_json(&app, req).await;

    let requests = mock_server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let upstream_request: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(upstream_request["reasoning_effort"], "medium");
    assert!(upstream_request.get("reasoning").is_none());
}

#[actix_web::test]
async fn test_messages_streaming() {
    let (app, mock_server) = setup_test_environment().await;

    let chunks = vec![
        ChatCompletionStreamChunk {
            id: "chatcmpl-123".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
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
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
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
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
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
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
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
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse_body),
        )
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "gpt-4",
        "max_tokens": 10,
        "stream": true,
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    });

    let req = test::TestRequest::post()
        .uri("/v1/messages")
        .set_json(&req_body)
        .to_request();

    let res = test::call_service(&app, req).await;
    assert!(res.status().is_success());
    assert_eq!(res.headers().get("Content-Type").unwrap(), "text/event-stream");

    let body_bytes = test::read_body(res).await;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    let events = parse_sse_events(&body_str);
    let event_names: Vec<String> = events.iter().map(|(name, _)| name.clone()).collect();

    assert_eq!(
        event_names,
        vec![
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]
    );

    let message_start = &events[0].1;
    assert_eq!(message_start["message"]["role"], "assistant");
    assert_eq!(message_start["message"]["type"], "message");

    let text_delta = &events[2].1;
    assert_eq!(text_delta["delta"]["type"], "text_delta");
    assert_eq!(text_delta["delta"]["text"], "Hello");

    let stop_delta = &events[5].1;
    assert_eq!(stop_delta["delta"]["stop_reason"], "end_turn");

    assert!(body_str.contains("data: [DONE]"));
}

#[actix_web::test]
async fn test_messages_streaming_tool_use() {
    let (app, mock_server) = setup_test_environment().await;

    let chunks = vec![
        ChatCompletionStreamChunk {
            id: "chatcmpl-234".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-4".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: Some(Role::Assistant),
                    content: None,
                    tool_calls: Some(vec![StreamToolCall {
                        index: 0,
                        id: Some("tool_call_1".to_string()),
                        tool_type: Some("function".to_string()),
                        function: Some(StreamFunctionCall {
                            name: Some("search".to_string()),
                            arguments: None,
                        }),
                    }]),
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-234".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-4".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: None,
                    tool_calls: Some(vec![StreamToolCall {
                        index: 0,
                        id: None,
                        tool_type: None,
                        function: Some(StreamFunctionCall {
                            name: None,
                            arguments: Some("{\"query\":\"hello\"}".to_string()),
                        }),
                    }]),
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-234".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-4".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: None,
                    tool_calls: None,
                },
                finish_reason: Some("tool_calls".to_string()),
            }],
        },
    ];

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
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse_body),
        )
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "gpt-4",
        "max_tokens": 10,
        "stream": true,
        "messages": [
            {"role": "user", "content": "Use a tool"}
        ]
    });

    let req = test::TestRequest::post()
        .uri("/v1/messages")
        .set_json(&req_body)
        .to_request();

    let res = test::call_service(&app, req).await;
    assert!(res.status().is_success());

    let body_bytes = test::read_body(res).await;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    let events = parse_sse_events(&body_str);
    let has_tool_start = events.iter().any(|(name, data)| {
        name == "content_block_start"
            && data["content_block"]["type"] == "tool_use"
            && data["content_block"]["name"] == "search"
            && data["content_block"]["id"] == "tool_call_1"
    });
    assert!(has_tool_start);

    let has_tool_delta = events.iter().any(|(name, data)| {
        name == "content_block_delta"
            && data["delta"]["type"] == "input_json_delta"
            && data["delta"]["partial_json"] == "{\"query\":\"hello\"}"
    });
    assert!(has_tool_delta);

    let has_tool_stop = events.iter().any(|(name, data)| {
        name == "content_block_stop" && data["index"].is_number()
    });
    assert!(has_tool_stop);

    let message_delta = events.iter().find(|(name, _)| name == "message_delta");
    assert!(message_delta.is_some());

    assert!(body_str.contains("data: [DONE]"));
}

#[actix_web::test]
async fn test_messages_streaming_text_and_tool_use() {
    let (app, mock_server) = setup_test_environment().await;

    let chunks = vec![
        ChatCompletionStreamChunk {
            id: "chatcmpl-345".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-4".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: Some(Role::Assistant),
                    content: Some("Starting".to_string()),
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-345".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-4".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: None,
                    tool_calls: Some(vec![StreamToolCall {
                        index: 1,
                        id: Some("tool_call_2".to_string()),
                        tool_type: Some("function".to_string()),
                        function: Some(StreamFunctionCall {
                            name: Some("lookup".to_string()),
                            arguments: Some("{\"id\":42}".to_string()),
                        }),
                    }]),
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-345".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-4".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: Some(" done".to_string()),
                    tool_calls: None,
                },
                finish_reason: Some("stop".to_string()),
            }],
        },
    ];

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
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse_body),
        )
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "gpt-4",
        "max_tokens": 10,
        "stream": true,
        "messages": [
            {"role": "user", "content": "Mix text and tool"}
        ]
    });

    let req = test::TestRequest::post()
        .uri("/v1/messages")
        .set_json(&req_body)
        .to_request();

    let res = test::call_service(&app, req).await;
    assert!(res.status().is_success());

    let body_bytes = test::read_body(res).await;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    let events = parse_sse_events(&body_str);
    let text_delta_count = events
        .iter()
        .filter(|(name, data)| name == "content_block_delta" && data["delta"]["type"] == "text_delta")
        .count();
    assert!(text_delta_count >= 1);

    let has_tool_use = events.iter().any(|(name, data)| {
        name == "content_block_start"
            && data["content_block"]["type"] == "tool_use"
            && data["content_block"]["name"] == "lookup"
    });
    assert!(has_tool_use);

    let has_tool_delta = events.iter().any(|(name, data)| {
        name == "content_block_delta"
            && data["delta"]["type"] == "input_json_delta"
            && data["delta"]["partial_json"] == "{\"id\":42}"
    });
    assert!(has_tool_delta);

    assert!(events.iter().any(|(name, _)| name == "message_stop"));
    assert!(body_str.contains("data: [DONE]"));
}

#[actix_web::test]
async fn test_complete_non_streaming() {
    let (app, mock_server) = setup_test_environment().await;

    let expected_completion = ChatCompletionResponse {
        id: "chatcmpl-456".to_string(),
        object: Some("chat.completion".to_string()),
        created: Some(1677652288),
        model: Some("gpt-3.5-turbo-0125".to_string()),
        choices: vec![ResponseChoice {
            index: 0,
            message: ChatMessage {
                role: Role::Assistant,
                content: Content::Text("Legacy response".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            finish_reason: Some("stop".to_string()),
        }],
        usage: None,
        system_fingerprint: None,
    };

    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&expected_completion))
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "gpt-4",
        "prompt": "Hello",
        "max_tokens_to_sample": 10
    });

    let req = test::TestRequest::post()
        .uri("/v1/complete")
        .set_json(&req_body)
        .to_request();

    let resp: Value = test::call_and_read_body_json(&app, req).await;

    let expected = json!({
        "type": "completion",
        "completion": "Legacy response",
        "model": "gpt-4",
        "stop_reason": "stop_sequence"
    });

    assert_eq!(resp, expected);
}

#[actix_web::test]
async fn test_complete_streaming() {
    let (app, mock_server) = setup_test_environment().await;

    let chunks = vec![
        ChatCompletionStreamChunk {
            id: "chatcmpl-789".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
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
            id: "chatcmpl-789".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: Some("Legacy".to_string()),
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-789".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: None,
                    content: Some(" response".to_string()),
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        },
        ChatCompletionStreamChunk {
            id: "chatcmpl-789".to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: 1677652288,
            model: Some("gpt-3.5-turbo-0125".to_string()),
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
                .insert_header("content-type", "text/event-stream")
                .set_body_string(sse_body),
        )
        .mount(&mock_server)
        .await;

    let req_body = json!({
        "model": "gpt-4",
        "prompt": "Hello",
        "max_tokens_to_sample": 10,
        "stream": true
    });

    let req = test::TestRequest::post()
        .uri("/v1/complete")
        .set_json(&req_body)
        .to_request();

    let res = test::call_service(&app, req).await;
    assert!(res.status().is_success());

    let body_bytes = test::read_body(res).await;
    let body_str = String::from_utf8(body_bytes.to_vec()).unwrap();

    let chunks = parse_sse_data(&body_str);
    assert!(chunks.iter().any(|chunk| chunk["completion"] == "Legacy"));
    assert!(chunks.iter().any(|chunk| chunk["completion"] == " response"));
    assert!(chunks.iter().any(|chunk| chunk["stop_reason"] == "stop_sequence"));
    assert!(body_str.contains("data: [DONE]"));
}

fn parse_sse_events(body: &str) -> Vec<(String, Value)> {
    let mut events = Vec::new();

    for raw in body.trim().split("\n\n") {
        if raw.trim().is_empty() {
            continue;
        }
        if raw.trim() == "data: [DONE]" {
            continue;
        }

        let mut event_name = None;
        let mut data = None;

        for line in raw.lines() {
            if let Some(name) = line.strip_prefix("event: ") {
                event_name = Some(name.to_string());
            } else if let Some(value) = line.strip_prefix("data: ") {
                data = Some(serde_json::from_str::<Value>(value).unwrap());
            }
        }

        if let (Some(name), Some(data)) = (event_name, data) {
            events.push((name, data));
        }
    }

    events
}

fn parse_sse_data(body: &str) -> Vec<Value> {
    let mut events = Vec::new();

    for raw in body.trim().split("\n\n") {
        if raw.trim().is_empty() {
            continue;
        }
        if raw.trim() == "data: [DONE]" {
            continue;
        }

        for line in raw.lines() {
            if let Some(value) = line.strip_prefix("data: ") {
                events.push(serde_json::from_str::<Value>(value).unwrap());
            }
        }
    }

    events
}
