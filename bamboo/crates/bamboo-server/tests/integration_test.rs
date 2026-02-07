use actix_web::{test, web, App};
use serde_json::json;

// Import the server modules
use bamboo_server::handlers::{chat, health, history, stop};
use bamboo_server::state::AppState;

#[actix_web::test]
async fn test_health_endpoint() {
    let state = web::Data::new(AppState::new().await);
    
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .route("/api/v1/health", web::get().to(health::handler))
    ).await;

    let req = test::TestRequest::get()
        .uri("/api/v1/health")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
    
    let body = test::read_body(resp).await;
    assert_eq!(body, "OK");
}

#[actix_web::test]
async fn test_chat_endpoint() {
    let state = web::Data::new(AppState::new().await);
    
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .route("/api/v1/chat", web::post().to(chat::handler))
    ).await;

    let request_body = json!({
        "message": "Hello, test!"
    });

    let req = test::TestRequest::post()
        .uri("/api/v1/chat")
        .set_json(&request_body)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
    
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body.get("session_id").is_some());
    assert!(body.get("stream_url").is_some());
    assert!(body["stream_url"].as_str().unwrap().contains("/api/v1/stream/"));
}

#[actix_web::test]
async fn test_chat_with_session_id() {
    let state = web::Data::new(AppState::new().await);
    
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .route("/api/v1/chat", web::post().to(chat::handler))
    ).await;

    let request_body = json!({
        "message": "Second message",
        "session_id": "test-session-123"
    });

    let req = test::TestRequest::post()
        .uri("/api/v1/chat")
        .set_json(&request_body)
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
    
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["session_id"], "test-session-123");
}

#[actix_web::test]
async fn test_history_endpoint() {
    let state = web::Data::new(AppState::new().await);
    
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .route("/api/v1/history/{session_id}", web::get().to(history::handler))
    ).await;

    let req = test::TestRequest::get()
        .uri("/api/v1/history/test-session")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());
    
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body.get("session_id").is_some());
    assert!(body.get("messages").is_some());
}

#[actix_web::test]
async fn test_stop_endpoint() {
    let state = web::Data::new(AppState::new().await);
    
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .route("/api/v1/stop/{session_id}", web::post().to(stop::handler))
    ).await;

    let req = test::TestRequest::post()
        .uri("/api/v1/stop/test-session")
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    // Should return 404 since the session doesn't have an active token
    assert_eq!(resp.status(), 404);
}
