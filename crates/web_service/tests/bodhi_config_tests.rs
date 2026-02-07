use actix_http::Request;
use actix_web::{
    dev::{Service, ServiceResponse},
    test, App, Error,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use bytes::Bytes;
use chat_core::ProxyAuth;
use copilot_client::client_trait::CopilotClientTrait;
use reqwest::Response;
use serde_json::{json, Value};
use skill_manager::SkillManager;
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
        _request: copilot_client::api::models::ChatCompletionRequest,
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

    let skill_manager = SkillManager::new();
    skill_manager.initialize().await.expect("init skills");
    let app_state = actix_web::web::Data::new(AppState {
        copilot_client,
        app_data_dir: temp_dir.path().to_path_buf(),
        skill_manager,
    });

    let app =
        test::init_service(App::new().app_data(app_state.clone()).configure(app_config)).await;
    (app, last_auth, temp_dir)
}

#[actix_web::test]
async fn test_bodhi_config_strips_proxy_auth() {
    let (app, _last_auth, temp_dir) = setup_test_environment().await;

    let payload = json!({
        "http_proxy": "http://proxy.example.com:8080",
        "https_proxy": "http://proxy.example.com:8080",
        "http_proxy_auth": { "username": "user", "password": "pass" },
        "https_proxy_auth": { "username": "user", "password": "pass" },
        "api_key": "ghu_xxx",
        "headless_auth": false
    });

    let req = test::TestRequest::post()
        .uri("/v1/bodhi/config")
        .set_json(&payload)
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;

    assert!(resp.get("http_proxy_auth").is_none());
    assert!(resp.get("https_proxy_auth").is_none());

    let config_path = temp_dir.path().join("config.json");
    let content = std::fs::read_to_string(&config_path).expect("config.json");
    let stored: Value = serde_json::from_str(&content).expect("stored json");
    assert!(stored.get("http_proxy_auth").is_none());
    assert!(stored.get("https_proxy_auth").is_none());

    let req = test::TestRequest::get()
        .uri("/v1/bodhi/config")
        .to_request();
    let resp: Value = test::call_and_read_body_json(&app, req).await;
    assert!(resp.get("http_proxy_auth").is_none());
    assert!(resp.get("https_proxy_auth").is_none());
}

#[actix_web::test]
async fn test_proxy_auth_endpoint_updates_client() {
    let (app, last_auth, _temp_dir) = setup_test_environment().await;

    let payload = json!({
        "username": "user",
        "password": "pass"
    });
    let req = test::TestRequest::post()
        .uri("/v1/bodhi/proxy-auth")
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
        .uri("/v1/bodhi/proxy-auth")
        .set_json(&payload)
        .to_request();
    let _resp: Value = test::call_and_read_body_json(&app, req).await;

    let stored = last_auth.lock().unwrap().clone();
    assert!(stored.is_none());
}
