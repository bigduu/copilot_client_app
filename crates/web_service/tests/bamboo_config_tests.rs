use actix_http::Request;
use actix_web::{
    dev::{Service, ServiceResponse},
    test, App, Error,
};
use agent_llm::client_trait::CopilotClientTrait;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use bytes::Bytes;
use chat_core::ProxyAuth;
use reqwest::Response;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tempfile::tempdir;
use tokio::sync::mpsc::Sender;
use web_service::server::{app_config, AppState};

struct MockCopilotClient {
    last_auth: Arc<Mutex<Option<ProxyAuth>>>,
}

#[async_trait]
impl CopilotClientTrait for MockCopilotClient {
    async fn send_chat_completion_request(
        &self,
        _request: agent_llm::api::models::ChatCompletionRequest,
    ) -> Result<Response> {
        Err(anyhow!("not used"))
    }

    async fn process_chat_completion_stream(
        &self,
        _response: Response,
        _tx: Sender<Result<Bytes>>,
    ) -> Result<()> {
        Err(anyhow!("not used"))
    }

    async fn get_models(&self) -> Result<Vec<String>> {
        Ok(vec![])
    }

    async fn update_proxy_auth(&self, auth: Option<ProxyAuth>) -> Result<()> {
        let mut guard = self.last_auth.lock().unwrap();
        *guard = auth;
        Ok(())
    }
}

async fn setup_test_environment() -> (
    impl Service<Request, Response = ServiceResponse, Error = Error>,
    Arc<Mutex<Option<ProxyAuth>>>,
    tempfile::TempDir,
) {
    let temp_dir = tempdir().expect("tempdir");
    let last_auth = Arc::new(Mutex::new(None));
    let copilot_client = Arc::new(MockCopilotClient {
        last_auth: Arc::clone(&last_auth),
    });

    let app_state = actix_web::web::Data::new(AppState {
        copilot_client,
        app_data_dir: temp_dir.path().to_path_buf(),
    });

    let app =
        test::init_service(App::new().app_data(app_state.clone()).configure(app_config)).await;
    (app, last_auth, temp_dir)
}

#[actix_web::test]
async fn test_bamboo_config_strips_proxy_auth() {
    // Set HOME to temp directory for config path resolution
    let temp_dir = tempdir().expect("tempdir");
    std::env::set_var("HOME", temp_dir.path());

    let (app, _last_auth, _temp_dir) = setup_test_environment().await;

    let payload = json!({
        "http_proxy": "http://proxy.example.com:8080",
        "https_proxy": "http://proxy.example.com:8080",
        "proxy_auth": { "username": "user", "password": "pass" },
        "model": "gpt-4",
        "headless_auth": false
    });

    let req = test::TestRequest::post()
        .uri("/v1/bamboo/config")
        .set_json(&payload)
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;

    // proxy_auth should be stripped from response
    assert!(resp.get("proxy_auth").is_none(), "proxy_auth should be stripped from POST response");
    assert!(resp.get("proxy_auth_encrypted").is_none(), "proxy_auth_encrypted should not exist in POST response");

    // Verify stored config exists and doesn't have plain proxy_auth
    let config_path = temp_dir.path().join(".bamboo").join("config.json");
    assert!(config_path.exists(), "config.json should be created at {:?}", config_path);

    let content = std::fs::read_to_string(&config_path).expect("config.json");
    let stored: Value = serde_json::from_str(&content).expect("stored json");
    assert!(stored.get("proxy_auth").is_none(), "stored config should not have plain proxy_auth");

    let req = test::TestRequest::get()
        .uri("/v1/bamboo/config")
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;
    // proxy_auth should still be stripped when reading
    assert!(resp.get("proxy_auth").is_none(), "GET response should not have proxy_auth");
    assert!(resp.get("proxy_auth_encrypted").is_none(), "GET response should not have proxy_auth_encrypted");

    // Cleanup
    std::env::remove_var("HOME");
}

#[actix_web::test]
async fn test_proxy_auth_endpoint_updates_client() {
    let (app, last_auth, _temp_dir) = setup_test_environment().await;

    let payload = json!({
        "username": "user",
        "password": "pass"
    });
    let req = test::TestRequest::post()
        .uri("/v1/bamboo/proxy-auth")
        .set_json(&payload)
        .to_request();
    let _resp: Value = test::call_and_read_body_json(&app, req).await;

    let stored = last_auth.lock().unwrap().clone();
    assert!(stored.is_some());
    let stored = stored.unwrap();
    assert_eq!(stored.username, "user");
    assert_eq!(stored.password, "pass");

    let payload = json!({
        "username": "",
        "password": ""
    });
    let req = test::TestRequest::post()
        .uri("/v1/bamboo/proxy-auth")
        .set_json(&payload)
        .to_request();
    let _resp: Value = test::call_and_read_body_json(&app, req).await;

    let stored = last_auth.lock().unwrap().clone();
    assert!(stored.is_none());
}
