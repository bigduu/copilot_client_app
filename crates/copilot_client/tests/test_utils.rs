//! Test utilities for retry middleware testing

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use reqwest::Client as ReqwestClient;
use reqwest_middleware::ClientBuilder;
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};

/// Creates a test HTTP client with retry middleware
pub fn create_test_client_with_retry(max_retries: u32) -> reqwest_middleware::ClientWithMiddleware {
    let retry_policy = ExponentialBackoff::builder()
        .base_secs(1)
        .max_retries(max_retries)
        .build();

    let client = ReqwestClient::builder()
        .no_proxy()
        .build()
        .expect("Failed to build HTTP client");

    ClientBuilder::new(client)
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build()
}

/// Creates a test HTTP client without retry (for comparison tests)
pub fn create_test_client_without_retry() -> reqwest_middleware::ClientWithMiddleware {
    let client = ReqwestClient::builder()
        .no_proxy()
        .build()
        .expect("Failed to build HTTP client");

    ClientBuilder::new(client).build()
}

/// Counter for tracking request attempts in tests
#[derive(Debug, Clone)]
pub struct RequestCounter {
    count: Arc<AtomicUsize>,
}

impl RequestCounter {
    pub fn new() -> Self {
        Self {
            count: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn increment(&self) -> usize {
        self.count.fetch_add(1, Ordering::SeqCst)
    }

    pub fn get(&self) -> usize {
        self.count.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.count.store(0, Ordering::SeqCst);
    }
}

impl Default for RequestCounter {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock response builder for tests
pub struct MockResponseBuilder;

impl MockResponseBuilder {
    /// Creates a successful Copilot API response
    pub fn copilot_success(token: &str) -> serde_json::Value {
        serde_json::json!({
            "token": token,
            "expires_at": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + 3600,
            "annotations_enabled": true,
            "chat_enabled": true,
            "chat_jetbrains_enabled": false,
            "code_quote_enabled": true,
            "code_review_enabled": false,
            "codesearch": false,
            "copilotignore_enabled": true,
            "endpoints": {
                "api": "https://api.githubcopilot.com"
            },
            "individual": true,
            "prompt_8k": true,
            "public_suggestions": "disabled",
            "refresh_in": 300,
            "sku": "copilot_individual",
            "snippy_load_test_enabled": false,
            "telemetry": "disabled",
            "tracking_id": "test-tracking-id",
            "vsc_electron_fetcher_v2": true,
            "xcode": false,
            "xcode_chat": false
        })
    }

    /// Creates a device code response
    pub fn device_code() -> serde_json::Value {
        serde_json::json!({
            "device_code": "test-device-code",
            "user_code": "ABCD-EFGH",
            "verification_uri": "https://github.com/login/device",
            "expires_in": 900,
            "interval": 5
        })
    }

    /// Creates an access token response
    pub fn access_token() -> serde_json::Value {
        serde_json::json!({
            "access_token": "test-access-token",
            "token_type": "bearer",
            "expires_in": 3600,
            "scope": "read:user"
        })
    }

    /// Creates a chat completion response
    pub fn chat_completion(content: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 1234567890,
            "model": "gpt-4",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop"
            }]
        })
    }

    /// Creates a models list response
    pub fn models_list() -> serde_json::Value {
        serde_json::json!({
            "data": [
                {
                    "id": "gpt-4",
                    "model_picker_enabled": true
                },
                {
                    "id": "gpt-3.5-turbo",
                    "model_picker_enabled": true
                }
            ]
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_counter() {
        let counter = RequestCounter::new();
        assert_eq!(counter.get(), 0);

        counter.increment();
        assert_eq!(counter.get(), 1);

        counter.increment();
        counter.increment();
        assert_eq!(counter.get(), 3);

        counter.reset();
        assert_eq!(counter.get(), 0);
    }

    #[test]
    fn test_mock_response_builder() {
        let token = "test-token";
        let response = MockResponseBuilder::copilot_success(token);
        assert_eq!(response["token"], token);
        assert_eq!(response["chat_enabled"], true);

        let device_code = MockResponseBuilder::device_code();
        assert_eq!(device_code["user_code"], "ABCD-EFGH");

        let access_token = MockResponseBuilder::access_token();
        assert_eq!(access_token["token_type"], "bearer");

        let completion = MockResponseBuilder::chat_completion("Hello!");
        assert_eq!(completion["choices"][0]["message"]["content"], "Hello!");

        let models = MockResponseBuilder::models_list();
        assert_eq!(models["data"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_create_test_client() {
        let client_with_retry = create_test_client_with_retry(3);
        let client_without_retry = create_test_client_without_retry();

        // Both clients should be created successfully
        assert!(true);
    }
}
