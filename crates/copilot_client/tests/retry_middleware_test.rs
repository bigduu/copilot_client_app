//! Tests for reqwest-retry middleware integration

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use reqwest::Client as ReqwestClient;
use reqwest_middleware::ClientBuilder;
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

/// Test that retry middleware retries on transient errors (5xx)
#[tokio::test]
async fn test_retry_on_server_error() {
    let mock_server = MockServer::start().await;
    let request_count = Arc::new(AtomicUsize::new(0));
    let counter = request_count.clone();

    // Mock that fails twice then succeeds
    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(move |_req: &wiremock::Request| {
            let count = counter.fetch_add(1, Ordering::SeqCst);
            if count < 2 {
                ResponseTemplate::new(503)
                    .set_body_string("Service Unavailable")
            } else {
                ResponseTemplate::new(200).set_body_string(r#"{"status": "ok"}"#)
            }
        })
        .expect(3) // Should be called 3 times (2 failures + 1 success)
        .mount(&mock_server)
        .await;

    // Build client with retry middleware
    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(3)
        .build();

    let client = ClientBuilder::new(ReqwestClient::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    // Make request
    let response = client
        .get(format!("{}/test", mock_server.uri()))
        .send()
        .await
        .expect("Request should succeed after retries");

    assert_eq!(response.status(), 200);
    assert_eq!(request_count.load(Ordering::SeqCst), 3);
}

/// Test that retry middleware retries on timeout
#[tokio::test]
async fn test_retry_on_timeout() {
    let mock_server = MockServer::start().await;
    let request_count = Arc::new(AtomicUsize::new(0));
    let counter = request_count.clone();

    // Mock that times out twice then succeeds
    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(move |_req: &wiremock::Request| {
            let count = counter.fetch_add(1, Ordering::SeqCst);
            if count < 2 {
                // Simulate timeout with delay
                ResponseTemplate::new(200)
                    .set_delay(std::time::Duration::from_secs(10))
                    .set_body_string(r#"{"status": "ok"}"#)
            } else {
                ResponseTemplate::new(200).set_body_string(r#"{"status": "ok"}"#)
            }
        })
        .expect(3)
        .mount(&mock_server)
        .await;

    // Build client with short timeout and retry
    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(3)
        .build();

    let http_client = ReqwestClient::builder()
        .timeout(std::time::Duration::from_millis(100))
        .build()
        .unwrap();

    let client = ClientBuilder::new(http_client)
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    // Make request - should timeout twice then succeed
    let response = client
        .get(format!("{}/test", mock_server.uri()))
        .send()
        .await
        .expect("Request should succeed after retries");

    assert_eq!(response.status(), 200);
    assert_eq!(request_count.load(Ordering::SeqCst), 3);
}

/// Test that retry middleware does NOT retry on 4xx errors (client errors)
#[tokio::test]
async fn test_no_retry_on_client_error() {
    let mock_server = MockServer::start().await;
    let request_count = Arc::new(AtomicUsize::new(0));
    let counter = request_count.clone();

    // Mock that returns 401
    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(move |_req: &wiremock::Request| {
            counter.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(401)
                .set_body_string(r#"{"error": "Unauthorized"}"#)
        })
        .expect(1) // Should only be called once (no retry)
        .mount(&mock_server)
        .await;

    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(3)
        .build();

    let client = ClientBuilder::new(ReqwestClient::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    let response = client
        .get(format!("{}/test", mock_server.uri()))
        .send()
        .await
        .expect("Request should complete");

    assert_eq!(response.status(), 401);
    assert_eq!(request_count.load(Ordering::SeqCst), 1);
}

/// Test that retry middleware retries on connection errors
#[tokio::test]
async fn test_retry_on_connection_error() {
    // Use an invalid port that should cause connection refused
    let invalid_url = "http://127.0.0.1:1/test";

    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(2)
        .build();

    let client = ClientBuilder::new(ReqwestClient::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    // This should fail after retries
    let result = client.get(invalid_url).send().await;
    assert!(result.is_err());
}

/// Test exponential backoff timing
#[tokio::test]
async fn test_exponential_backoff_timing() {
    let mock_server = MockServer::start().await;
    let timestamps: Arc<std::sync::Mutex<Vec<std::time::Instant>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));
    let timestamps_clone = timestamps.clone();

    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(move |_req: &wiremock::Request| {
            timestamps_clone.lock().unwrap().push(std::time::Instant::now());
            ResponseTemplate::new(503)
        })
        .expect(3)
        .mount(&mock_server)
        .await;

    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1) // 1s, 2s, 4s...
        .max_retries(3)
        .build();

    let client = ClientBuilder::new(ReqwestClient::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    let start = std::time::Instant::now();
    let _ = client
        .get(format!("{}/test", mock_server.uri()))
        .send()
        .await;
    let elapsed = start.elapsed();

    let times = timestamps.lock().unwrap();
    assert_eq!(times.len(), 3);

    // Should have taken at least 3 seconds (1s + 2s between retries)
    assert!(
        elapsed >= std::time::Duration::from_secs(3),
        "Expected at least 3s elapsed, got {:?}",
        elapsed
    );
}

/// Test successful request on first attempt (no retry needed)
#[tokio::test]
async fn test_no_retry_on_success() {
    let mock_server = MockServer::start().await;
    let request_count = Arc::new(AtomicUsize::new(0));
    let counter = request_count.clone();

    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(move |_req: &wiremock::Request| {
            counter.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(200).set_body_string(r#"{"status": "ok"}"#)
        })
        .expect(1) // Should only be called once
        .mount(&mock_server)
        .await;

    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(3)
        .build();

    let client = ClientBuilder::new(ReqwestClient::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    let response = client
        .get(format!("{}/test", mock_server.uri()))
        .send()
        .await
        .expect("Request should succeed");

    assert_eq!(response.status(), 200);
    assert_eq!(request_count.load(Ordering::SeqCst), 1);
}

/// Test max retries limit
#[tokio::test]
async fn test_max_retries_limit() {
    let mock_server = MockServer::start().await;
    let request_count = Arc::new(AtomicUsize::new(0));
    let counter = request_count.clone();

    // Always returns 503
    Mock::given(method("GET"))
        .and(path("/test"))
        .respond_with(move |_req: &wiremock::Request| {
            counter.fetch_add(1, Ordering::SeqCst);
            ResponseTemplate::new(503)
        })
        .expect(4) // Initial + 3 retries
        .mount(&mock_server)
        .await;

    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(3)
        .build();

    let client = ClientBuilder::new(ReqwestClient::new())
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    let response = client
        .get(format!("{}/test", mock_server.uri()))
        .send()
        .await
        .expect("Request should complete");

    // Should get the last error response
    assert_eq!(response.status(), 503);
    assert_eq!(request_count.load(Ordering::SeqCst), 4);
}
