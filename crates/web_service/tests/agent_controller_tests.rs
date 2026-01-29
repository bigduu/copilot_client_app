use actix_web::{test, web, App};
use web_service::controllers::agent_controller;
use web_service::server::app_config;

async fn create_test_app() -> impl actix_web::dev::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    test::init_service(
        App::new().configure(app_config)
    ).await
}

#[actix_web::test]
async fn test_list_running_sessions_endpoint_exists() {
    let app = create_test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/v1/agent/sessions/running")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Endpoint should exist and return a response (may be error due to filesystem)
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_execute_endpoint_exists() {
    let app = create_test_app().await;
    
    let payload = serde_json::json!({
        "project_path": "/tmp/test",
        "prompt": "Hello",
        "session_id": null
    });
    let req = test::TestRequest::post()
        .uri("/v1/agent/sessions/execute")
        .set_json(&payload)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Placeholder returns success
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_cancel_endpoint_exists() {
    let app = create_test_app().await;
    
    let payload = serde_json::json!({"session_id": "test-session"});
    let req = test::TestRequest::post()
        .uri("/v1/agent/sessions/cancel")
        .set_json(&payload)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Placeholder returns success or internal error
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_create_project_invalid_path_returns_error() {
    let app = create_test_app().await;
    
    let payload = serde_json::json!({"path": "/nonexistent/path/12345"});
    let req = test::TestRequest::post()
        .uri("/v1/agent/projects")
        .set_json(&payload)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Should fail for non-existent path
    assert!(!resp.status().is_success());
}

#[actix_web::test]
async fn test_get_claude_settings_endpoint_exists() {
    let app = create_test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/v1/agent/settings")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Should return default settings or internal error
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_get_system_prompt_endpoint_exists() {
    let app = create_test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/v1/agent/system-prompt")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Should return empty content or internal error
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_list_projects_endpoint_exists() {
    let app = create_test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/v1/agent/projects")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // The endpoint should respond
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_save_settings_endpoint_exists() {
    let app = create_test_app().await;
    
    let settings = serde_json::json!({"settings": {"theme": "dark"}});
    let req = test::TestRequest::post()
        .uri("/v1/agent/settings")
        .set_json(&settings)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // The endpoint should accept the request
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_save_system_prompt_endpoint_exists() {
    let app = create_test_app().await;
    
    let payload = serde_json::json!({"content": "You are a helpful assistant."});
    let req = test::TestRequest::post()
        .uri("/v1/agent/system-prompt")
        .set_json(&payload)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // The endpoint should accept the request
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_get_project_sessions_endpoint_exists() {
    let app = create_test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/v1/agent/projects/test-project/sessions")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // The endpoint should respond
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}

#[actix_web::test]
async fn test_get_session_jsonl_endpoint_exists() {
    let app = create_test_app().await;
    
    let req = test::TestRequest::get()
        .uri("/v1/agent/sessions/test-session/jsonl?project_id=test-project")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // The endpoint should respond
    let status = resp.status().as_u16();
    assert!(status == 200 || status == 500, "Expected 200 or 500, got {}", status);
}
