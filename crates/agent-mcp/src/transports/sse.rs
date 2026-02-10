use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::{Client, header::HeaderMap};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, error, info, warn};

use crate::config::{HeaderConfig, SseConfig};
use crate::error::{McpError, Result};
use crate::protocol::client::McpTransport;

pub struct SseTransport {
    config: SseConfig,
    client: Client,
    connected: AtomicBool,
    message_tx: mpsc::Sender<String>,
    message_rx: Mutex<mpsc::Receiver<String>>,
    sse_handle: Option<tokio::task::JoinHandle<()>>,
    endpoint_url: Mutex<Option<String>>,
}

impl SseTransport {
    pub fn new(config: SseConfig) -> Self {
        let (message_tx, message_rx) = mpsc::channel(100);
        Self {
            config,
            client: Client::new(),
            connected: AtomicBool::new(false),
            message_tx,
            message_rx: Mutex::new(message_rx),
            sse_handle: None,
            endpoint_url: Mutex::new(None),
        }
    }

    fn build_headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(
            reqwest::header::ACCEPT,
            "text/event-stream".parse().unwrap(),
        );

        for HeaderConfig { name, value } in &self.config.headers {
            let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
                .map_err(|e| McpError::InvalidConfig(format!("Invalid header name: {}", e)))?;
            let header_value = value.parse().map_err(|e| {
                McpError::InvalidConfig(format!("Invalid header value: {}", e))
            })?;
            headers.insert(header_name, header_value);
        }

        Ok(headers)
    }
}

#[async_trait]
impl McpTransport for SseTransport {
    async fn connect(&mut self) -> Result<()> {
        info!("Connecting to MCP SSE endpoint: {}", self.config.url);

        let headers = self.build_headers()?;
        let response = self
            .client
            .get(&self.config.url)
            .headers(headers)
            .timeout(tokio::time::Duration::from_millis(self.config.connect_timeout_ms))
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(McpError::Connection(format!(
                "HTTP error: {}",
                response.status()
            )));
        }

        // Start SSE event handler
        let message_tx = self.message_tx.clone();
        let url = self.config.url.clone();

        let handle = tokio::spawn(async move {
            let mut stream = response.bytes_stream().eventsource();
            while let Some(event) = stream.next().await {
                match event {
                    Ok(event) => {
                        debug!("SSE event: {}", event.event);
                        if event.event == "endpoint" {
                            // Store the endpoint URL for POST requests
                            debug!("Got endpoint: {}", event.data);
                        } else if event.event == "message" || event.event.is_empty() {
                            if let Err(_) = message_tx.send(event.data).await {
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        warn!("SSE stream error: {}", e);
                        break;
                    }
                }
            }
            warn!("SSE stream ended for {}", url);
        });

        self.sse_handle = Some(handle);
        self.connected.store(true, Ordering::SeqCst);

        info!("MCP SSE transport connected");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        info!("Disconnecting MCP SSE transport");

        self.connected.store(false, Ordering::SeqCst);

        if let Some(handle) = self.sse_handle.take() {
            handle.abort();
        }

        Ok(())
    }

    async fn send(&self, message: String) -> Result<()> {
        if !self.is_connected() {
            return Err(McpError::Disconnected);
        }

        // For SSE transport, we need to POST to the endpoint
        let endpoint = self.endpoint_url.lock().await.clone();
        let post_url = endpoint.unwrap_or_else(|| {
            // If no endpoint was provided via SSE, use the base URL + "/message"
            format!("{}/message", self.config.url.trim_end_matches("/sse"))
        });

        let headers = self.build_headers()?;

        let response = self
            .client
            .post(&post_url)
            .headers(headers)
            .header("Content-Type", "application/json")
            .body(message)
            .timeout(tokio::time::Duration::from_secs(60))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(McpError::Transport(format!(
                "POST failed: {} - {}",
                status, body
            )));
        }

        debug!("Sent message via POST to {}", post_url);
        Ok(())
    }

    async fn receive(&self) -> Result<Option<String>> {
        if !self.is_connected() {
            return Err(McpError::Disconnected);
        }

        let mut rx = self.message_rx.lock().await;
        match tokio::time::timeout(
            tokio::time::Duration::from_millis(100),
            rx.recv(),
        )
        .await
        {
            Ok(Some(message)) => {
                debug!("Received SSE message: {}", message);
                Ok(Some(message))
            }
            Ok(None) => {
                // Channel closed
                warn!("SSE message channel closed");
                Err(McpError::Disconnected)
            }
            Err(_) => {
                // Timeout, no message available
                Ok(None)
            }
        }
    }

    fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }
}
