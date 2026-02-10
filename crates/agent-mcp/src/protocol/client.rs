use async_trait::async_trait;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, RwLock};
use tracing::{debug, error, warn};

use crate::error::{McpError, Result};
use crate::protocol::models::*;
use crate::types::{McpCallResult, McpTool};

/// Transport trait for MCP communication
#[async_trait]
pub trait McpTransport: Send + Sync {
    async fn connect(&mut self) -> Result<()>;
    async fn disconnect(&mut self) -> Result<()>;
    async fn send(&self, message: String) -> Result<()>;
    async fn receive(&self) -> Result<Option<String>>;
    fn is_connected(&self) -> bool;
}

/// Pending request waiting for response
struct PendingRequest {
    sender: oneshot::Sender<Result<JsonRpcResponse>>,
}

/// MCP protocol client
pub struct McpProtocolClient {
    transport: Arc<RwLock<Box<dyn McpTransport>>>,
    next_id: AtomicU64,
    pending_requests: Arc<RwLock<std::collections::HashMap<u64, PendingRequest>>>,
    message_handler: Option<tokio::task::JoinHandle<()>>,
    notification_tx: mpsc::Sender<JsonRpcNotification>,
    notification_rx: Arc<RwLock<mpsc::Receiver<JsonRpcNotification>>>,
}

impl McpProtocolClient {
    pub fn new(transport: Box<dyn McpTransport>) -> Self {
        let (notification_tx, notification_rx) = mpsc::channel(100);
        Self {
            transport: Arc::new(RwLock::new(transport)),
            next_id: AtomicU64::new(1),
            pending_requests: Arc::new(RwLock::new(std::collections::HashMap::new())),
            message_handler: None,
            notification_tx,
            notification_rx: Arc::new(RwLock::new(notification_rx)),
        }
    }

    pub async fn connect(&mut self) -> Result<()> {
        let mut transport = self.transport.write().await;
        transport.connect().await?;
        drop(transport);

        // Start message handler
        self.start_message_handler();

        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        if let Some(handler) = self.message_handler.take() {
            handler.abort();
        }

        let mut transport = self.transport.write().await;
        transport.disconnect().await
    }

    fn start_message_handler(&mut self) {
        let transport = self.transport.clone();
        let pending_requests = self.pending_requests.clone();
        let notification_tx = self.notification_tx.clone();

        let handler = tokio::spawn(async move {
            loop {
                let transport = transport.read().await;
                if !transport.is_connected() {
                    break;
                }

                match transport.receive().await {
                    Ok(Some(message)) => {
                        debug!("Received message: {}", message);
                        if let Err(e) = Self::handle_message(
                            &message,
                            &pending_requests,
                            &notification_tx,
                        )
                        .await
                        {
                            warn!("Failed to handle message: {}", e);
                        }
                    }
                    Ok(None) => {
                        // No message available, continue
                        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                    }
                    Err(e) => {
                        error!("Transport error: {}", e);
                        break;
                    }
                }
            }
        });

        self.message_handler = Some(handler);
    }

    async fn handle_message(
        message: &str,
        pending_requests: &RwLock<std::collections::HashMap<u64, PendingRequest>>,
        notification_tx: &mpsc::Sender<JsonRpcNotification>,
    ) -> Result<()> {
        // Try to parse as response
        if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(message) {
            let mut pending = pending_requests.write().await;
            if let Some(request) = pending.remove(&response.id) {
                let _ = request.sender.send(Ok(response));
            }
            return Ok(());
        }

        // Try to parse as notification
        if let Ok(notification) = serde_json::from_str::<JsonRpcNotification>(message) {
            let _ = notification_tx.send(notification).await;
            return Ok(());
        }

        Err(McpError::Protocol("Unknown message type".to_string()))
    }

    async fn send_request(&self,
        method: &str,
        params: Option<Value>,
        timeout_ms: u64,
    ) -> Result<JsonRpcResponse> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        let request = JsonRpcRequest::new(id, method, params);
        let request_json = serde_json::to_string(&request)?;

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.write().await;
            pending.insert(id, PendingRequest { sender: tx });
        }

        let transport = self.transport.read().await;
        transport.send(request_json).await?;
        drop(transport);

        match tokio::time::timeout(
            tokio::time::Duration::from_millis(timeout_ms),
            rx,
        )
        .await
        {
            Ok(Ok(Ok(response))) => {
                if let Some(error) = response.error {
                    Err(McpError::Protocol(format!(
                        "{}: {}",
                        error.code, error.message
                    )))
                } else {
                    Ok(response)
                }
            }
            Ok(Ok(Err(e))) => Err(e),
            Ok(Err(_)) => Err(McpError::Disconnected),
            Err(_) => {
                self.pending_requests.write().await.remove(&id);
                Err(McpError::Timeout(format!(
                    "Request {} timed out after {}ms",
                    id, timeout_ms
                )))
            }
        }
    }

    pub async fn initialize(&self, timeout_ms: u64) -> Result<McpInitializeResult> {
        let request = McpInitializeRequest::default();
        let params = serde_json::to_value(request)?;

        let response = self
            .send_request("initialize", Some(params), timeout_ms)
            .await?;

        let result: McpInitializeResult = serde_json::from_value(
            response.result.ok_or_else(|| McpError::Protocol("Missing result".to_string()))?
        )?;

        // Send initialized notification
        let initialized = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "notifications/initialized".to_string(),
            params: None,
        };
        let transport = self.transport.read().await;
        transport.send(serde_json::to_string(&initialized)?).await?;

        Ok(result)
    }

    pub async fn list_tools(&self, timeout_ms: u64) -> Result<Vec<McpTool>> {
        let response = self
            .send_request("tools/list", None, timeout_ms)
            .await?;

        let result: McpToolListResult = serde_json::from_value(
            response.result.ok_or_else(|| McpError::Protocol("Missing result".to_string()))?
        )?;

        Ok(result
            .tools
            .into_iter()
            .map(|t| McpTool {
                name: t.name,
                description: t.description,
                parameters: t.input_schema.unwrap_or_else(|| serde_json::json!({})),
            })
            .collect())
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: Value,
        timeout_ms: u64,
    ) -> Result<McpCallResult> {
        let request = McpToolCallRequest {
            name: name.to_string(),
            arguments: Some(arguments),
        };
        let params = serde_json::to_value(request)?;

        let response = self
            .send_request("tools/call", Some(params), timeout_ms)
            .await?;

        let result: McpToolCallResult = serde_json::from_value(
            response.result.ok_or_else(|| McpError::Protocol("Missing result".to_string()))?
        )?;

        Ok(McpCallResult {
            content: result
                .content
                .into_iter()
                .map(|item| match item {
                    McpContentItem::Text { text } => crate::types::McpContentItem::Text { text },
                    McpContentItem::Image { data, mime_type } => {
                        crate::types::McpContentItem::Image { data, mime_type }
                    }
                    McpContentItem::Resource { resource } => {
                        crate::types::McpContentItem::Resource {
                            resource: crate::types::McpResource {
                                uri: resource.uri,
                                mime_type: resource.mime_type,
                                text: resource.text,
                                blob: resource.blob,
                            },
                        }
                    }
                })
                .collect(),
            is_error: result.is_error,
        })
    }

    pub async fn ping(&self, timeout_ms: u64) -> Result<()> {
        self.send_request("ping", None, timeout_ms).await?;
        Ok(())
    }

    pub async fn try_receive_notification(&self) -> Option<JsonRpcNotification> {
        let mut rx = self.notification_rx.write().await;
        rx.try_recv().ok()
    }
}
