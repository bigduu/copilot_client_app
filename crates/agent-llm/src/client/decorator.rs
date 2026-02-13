use std::time::Instant;

use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;
use log::warn;
use reqwest::Response;
use tokio::sync::mpsc::{self, Sender};

use agent_metrics::{
    EventMeta, ForwardEvent, ForwardStatus, MetricsBus, MetricsEvent, TokenUsage,
};

use crate::client_trait::CopilotClientTrait;
use crate::models::{ChatCompletionRequest, ChatCompletionStreamChunk};
use chat_core::ProxyAuth;

/// A decorator that wraps a CopilotClient and automatically collects metrics
/// for all forwarded requests.
pub struct MetricsClientDecorator<T: CopilotClientTrait> {
    inner: T,
    metrics: MetricsBus,
    endpoint: String,
}

impl<T: CopilotClientTrait> MetricsClientDecorator<T> {
    /// Create a new metrics decorator
    ///
    /// # Arguments
    /// * `inner` - The underlying client to wrap
    /// * `metrics` - The metrics bus to emit events to
    /// * `endpoint` - The endpoint identifier (e.g., "openai.chat_completions")
    pub fn new(inner: T, metrics: MetricsBus, endpoint: impl Into<String>) -> Self {
        Self {
            inner,
            metrics,
            endpoint: endpoint.into(),
        }
    }

    /// Convert the Usage struct from the API response to TokenUsage
    fn convert_usage(usage: Option<crate::models::Usage>) -> Option<TokenUsage> {
        usage.map(|u| TokenUsage {
            prompt_tokens: u.prompt_tokens as u64,
            completion_tokens: u.completion_tokens as u64,
            total_tokens: u.total_tokens as u64,
        })
    }
}

#[async_trait]
impl<T: CopilotClientTrait> CopilotClientTrait for MetricsClientDecorator<T> {
    async fn send_chat_completion_request(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<Response> {
        let start = Instant::now();
        let request_id = uuid::Uuid::new_v4().to_string();
        let model = request.model.clone();
        let is_stream = request.stream.unwrap_or(false);

        // Emit started event
        self.metrics.emit(MetricsEvent::Forward(ForwardEvent::RequestStarted {
            meta: EventMeta::new(),
            request_id: request_id.clone(),
            endpoint: self.endpoint.clone(),
            model: model.clone(),
            is_stream,
        }));

        // Call inner client
        let result = self.inner.send_chat_completion_request(request).await;
        let latency_ms = start.elapsed().as_millis() as u64;

        // Emit completed event based on result
        match &result {
            Ok(response) => {
                let status_code = response.status().as_u16();
                let status = if response.status().is_success() {
                    ForwardStatus::Success
                } else {
                    ForwardStatus::Error
                };

                // For non-streaming requests, we can extract usage immediately
                let usage = if !is_stream {
                    // We can't get usage here without consuming the response
                    // For non-streaming, we could clone but that's expensive
                    // We'll get usage from stream processing for streaming requests
                    None
                } else {
                    None
                };

                self.metrics.emit(MetricsEvent::Forward(ForwardEvent::RequestCompleted {
                    meta: EventMeta::new(),
                    request_id: request_id.clone(),
                    status_code,
                    status,
                    usage,
                    latency_ms,
                    error: None,
                }));
            }
            Err(e) => {
                self.metrics.emit(MetricsEvent::Forward(ForwardEvent::RequestCompleted {
                    meta: EventMeta::new(),
                    request_id: request_id.clone(),
                    status_code: 0,
                    status: ForwardStatus::Error,
                    usage: None,
                    latency_ms,
                    error: Some(e.to_string()),
                }));
            }
        }

        result
    }

    async fn process_chat_completion_stream(
        &self,
        response: Response,
        tx: Sender<Result<Bytes>>,
    ) -> Result<()> {
        let request_id = uuid::Uuid::new_v4().to_string();
        let start = Instant::now();

        // Create intermediate channel to intercept chunks and extract usage
        let (intercept_tx, mut intercept_rx) = mpsc::channel::<Result<Bytes>>(100);
        let tx_clone = tx.clone();

        // Spawn task to forward chunks and extract usage
        let forward_handle = tokio::spawn(async move {
            let mut last_usage: Option<crate::models::Usage> = None;

            while let Some(chunk) = intercept_rx.recv().await {
                // Try to parse chunk to extract usage
                if let Ok(bytes) = &chunk {
                    if let Ok(json_str) = std::str::from_utf8(bytes) {
                        if json_str != "[DONE]" {
                            if let Ok(stream_chunk) =
                                serde_json::from_str::<ChatCompletionStreamChunk>(json_str)
                            {
                                if let Some(u) = stream_chunk.usage {
                                    last_usage = Some(u);
                                }
                            }
                        }
                    }
                }

                // Forward to original sender
                if tx_clone.send(chunk).await.is_err() {
                    warn!("MetricsClientDecorator: Failed to forward chunk - receiver dropped");
                    break;
                }
            }

            last_usage
        });

        // Call inner client's stream processing
        let inner_result = self
            .inner
            .process_chat_completion_stream(response, intercept_tx)
            .await;

        // Wait for forwarding to complete and get usage
        let usage = match forward_handle.await {
            Ok(u) => u,
            Err(e) => {
                warn!("MetricsClientDecorator: Forward task failed: {}", e);
                None
            }
        };

        let latency_ms = start.elapsed().as_millis() as u64;

        // Emit completion event with usage
        let status = if inner_result.is_ok() {
            ForwardStatus::Success
        } else {
            ForwardStatus::Error
        };

        self.metrics.emit(MetricsEvent::Forward(ForwardEvent::RequestCompleted {
            meta: EventMeta::new(),
            request_id,
            status_code: if inner_result.is_ok() { 200 } else { 500 },
            status,
            usage: Self::convert_usage(usage),
            latency_ms,
            error: inner_result.as_ref().err().map(|e| e.to_string()),
        }));

        inner_result
    }

    async fn get_models(&self) -> Result<Vec<String>> {
        self.inner.get_models().await
    }

    async fn update_proxy_auth(&self, auth: Option<ProxyAuth>) -> Result<()> {
        self.inner.update_proxy_auth(auth).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    // Mock client for testing
    struct MockClient {
        should_fail: bool,
        request_count: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl CopilotClientTrait for MockClient {
        async fn send_chat_completion_request(
            &self,
            _request: ChatCompletionRequest,
        ) -> Result<Response> {
            self.request_count.fetch_add(1, Ordering::SeqCst);
            // We can't easily create a Response, so just return an error for testing
            Err(anyhow::anyhow!("Mock client: request would succeed"))
        }

        async fn process_chat_completion_stream(
            &self,
            _response: Response,
            _tx: Sender<Result<Bytes>>,
        ) -> Result<()> {
            self.request_count.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        async fn get_models(&self) -> Result<Vec<String>> {
            Ok(vec!["gpt-4".to_string()])
        }

        async fn update_proxy_auth(&self, _auth: Option<ProxyAuth>) -> Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_decorator_emits_events() {
        let (bus, mut rx) = MetricsBus::new(100);
        let mock_client = MockClient {
            should_fail: false,
            request_count: Arc::new(AtomicUsize::new(0)),
        };

        let decorator = MetricsClientDecorator::new(
            mock_client,
            bus,
            "openai.chat_completions",
        );

        // Make a request
        let request = ChatCompletionRequest {
            model: "gpt-4".to_string(),
            messages: vec![],
            tools: None,
            tool_choice: None,
            stream: Some(false),
            stream_options: None,
            parameters: Default::default(),
        };

        let _ = decorator.send_chat_completion_request(request).await;

        // Check that events were emitted
        let mut found_started = false;
        let mut found_completed = false;
        let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(1);

        while tokio::time::Instant::now() < deadline {
            if let Ok(Some(event)) =
                tokio::time::timeout(tokio::time::Duration::from_millis(100), rx.recv()).await
            {
                match event {
                    MetricsEvent::Forward(ForwardEvent::RequestStarted { .. }) => {
                        found_started = true;
                    }
                    MetricsEvent::Forward(ForwardEvent::RequestCompleted { .. }) => {
                        found_completed = true;
                    }
                    _ => {}
                }

                if found_started && found_completed {
                    break;
                }
            }
        }

        assert!(found_started, "Should have emitted RequestStarted event");
        assert!(
            found_completed,
            "Should have emitted RequestCompleted event"
        );
    }
}
