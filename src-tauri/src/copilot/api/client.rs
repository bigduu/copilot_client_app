use anyhow::anyhow;
use bytes::Bytes;
use log::{error, info, warn};
use reqwest::{Client, Proxy, Response};
use std::{path::PathBuf, sync::Arc};
use tauri::http::HeaderMap;
use tokio::sync::mpsc::Sender;

// Tentative path adjustments - will be finalized in Phase 4
// use super::http_utils::execute_request; // This should be correct as http_utils is in the same `api` module
use crate::copilot::model::{block_model, stream_model::ChatCompletionRequest}; // Adjusted path
use crate::copilot::utils::http_utils::execute_request;
use crate::copilot::utils::sse::extract_sse_message; // Adjusted path

// use super::models_handler::CopilotModelsHandler; // This should be correct
use super::models_handler::CopilotModelsHandler;
use crate::copilot::auth::auth_handler::CopilotAuthHandler;
use crate::copilot::config::Config;
use crate::copilot::model::stream_model::{Message, StreamChunk}; // Adjusted path

const DEFAULT_COPILOT_MODEL: &str = "gpt-4.1";

// Main Copilot Client struct
#[derive(Debug, Clone)]
pub struct CopilotClient {
    client: Arc<Client>,
    auth_handler: CopilotAuthHandler,
    models_handler: CopilotModelsHandler,
}

impl CopilotClient {
    pub fn new(config: Config, app_data_dir: PathBuf) -> Self {
        let mut builder = Client::builder().default_headers(Self::get_default_headers());
        if !config.http_proxy.is_empty() {
            builder = builder.proxy(Proxy::http(&config.http_proxy).unwrap());
        }
        if !config.https_proxy.is_empty() {
            builder = builder.proxy(Proxy::https(&config.https_proxy).unwrap());
        }
        let client: Client = builder.build().unwrap();
        let shared_client = Arc::new(client);

        let auth_handler =
            CopilotAuthHandler::new(Arc::clone(&shared_client), app_data_dir.clone()); // Pass app_data_dir
        let models_handler = CopilotModelsHandler::new(Arc::clone(&shared_client));

        CopilotClient {
            client: shared_client,
            auth_handler,
            models_handler,
        }
    }

    pub async fn get_models(&self) -> anyhow::Result<Vec<String>> {
        let chat_token = self.auth_handler.get_chat_token().await?;
        self.models_handler.get_models(chat_token).await
    }

    pub async fn send_block_request(
        &self,
        messages: Vec<Message>,
        model: Option<String>,
    ) -> (
        tokio::sync::mpsc::Receiver<anyhow::Result<Bytes>>,
        tokio::task::JoinHandle<anyhow::Result<()>>,
    ) {
        let (tx, rx) = tokio::sync::mpsc::channel::<anyhow::Result<Bytes>>(999);
        let model = model.unwrap_or_else(|| DEFAULT_COPILOT_MODEL.to_string());
        let request = ChatCompletionRequest::new_block(model, messages.clone());
        let client = Arc::new(self.clone());
        let handle = tokio::spawn(async move {
            let response = client.send_request(messages, &request).await;
            match response {
                Ok(resp) => {
                    info!("Successfully got block response");
                    client.process_block_response(resp, tx).await
                }
                Err(e) => {
                    error!("Failed to send block request: {:?}", e);
                    let _ = tx.send(Err(e)).await;
                    Ok(())
                }
            }
        });
        (rx, handle)
    }

    async fn process_block_response(
        &self,
        response: Response,
        tx: Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        let response_text = response.text().await.map_err(|e| {
            error!("Failed to parse block response: {:?}", e);
            e
        })?;
        info!("The response: {}", response_text);
        let response =
            serde_json::from_str::<block_model::Response>(&response_text).map_err(|e| {
                error!("Failed to parse block response: {:?}", e);
                e
            })?;
        let first = response.choices.first().unwrap();
        info!("The first message: {}", first.message.content.clone());

        // Send the content
        tx.send(Ok(bytes::Bytes::from(first.message.content.clone())))
            .await
            .map_err(|_| anyhow!("Failed to send response"))?;

        // Send the DONE signal
        tx.send(Ok(bytes::Bytes::from("[DONE]")))
            .await
            .map_err(|_| anyhow!("Failed to send [DONE]"))?;

        Ok(())
    }

    pub async fn send_stream_request(
        &self,
        messages: Vec<Message>,
        model: Option<String>,
    ) -> (
        tokio::sync::mpsc::Receiver<anyhow::Result<Bytes>>,
        tokio::task::JoinHandle<anyhow::Result<()>>,
    ) {
        let (tx, rx) = tokio::sync::mpsc::channel::<anyhow::Result<Bytes>>(999);
        let model = model.unwrap_or_else(|| DEFAULT_COPILOT_MODEL.to_string());
        let request = ChatCompletionRequest::new_stream(model, messages.clone());
        let client = self.clone();
        let handle = tokio::spawn(async move {
            let response = client.send_request(messages, &request).await;
            match response {
                Ok(resp) => client.forward_message(resp, tx).await,
                Err(e) => {
                    let _ = tx.send(Err(e)).await;
                    Ok(())
                }
            }
        });
        (rx, handle)
    }

    async fn send_request(
        &self,
        messages: Vec<Message>,
        request: &ChatCompletionRequest,
    ) -> anyhow::Result<Response> {
        info!("=== EXCHANGE_CHAT_COMPLETION START ===");
        let access_token = self.auth_handler.get_chat_token().await.map_err(|e| {
            info!("Failed to get chat token: {e:?}");
            e
        })?;

        info!("Successfully got chat token");

        let url = "https://api.githubcopilot.com/chat/completions";
        info!("Preparing request with {} messages", messages.len());
        info!("Sending request to Copilot API via http_utils...");

        execute_request(
            &self.client,
            reqwest::Method::POST,
            url,
            Some(&access_token),
            Some(request),
        )
        .await
    }

    async fn forward_message(
        &self,
        response: Response,
        tx: Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    let text = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&text);
                    self.process_buffer(&mut buffer, &tx).await?;
                }
                Err(e) => {
                    self.send_error(&tx, format!("Error reading chunk from OpenAI: {e}"))
                        .await?;
                }
            }
        }

        // Process any remaining data in buffer
        if !buffer.is_empty() {
            if let Some((message, _)) = extract_sse_message(&buffer) {
                self.process_message(&message, &tx).await?;
            }
        }

        Ok(())
    }

    async fn process_buffer(
        &self,
        buffer: &mut String,
        tx: &Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        while let Some((message, remaining)) = extract_sse_message(buffer) {
            *buffer = remaining.to_string();
            if message.trim() == "[DONE]" {
                info!("Received [DONE] signal");
                break;
            }
            self.process_message(&message, tx).await?;
        }
        Ok(())
    }

    async fn process_message(
        &self,
        data: &str,
        tx: &Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        self.parse_and_send_chunk(data, tx).await
    }

    async fn parse_and_send_chunk(
        &self,
        data: &str,
        tx: &Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        match serde_json::from_str::<StreamChunk>(data) {
            Ok(chunk_data) => {
                let vec = serde_json::to_vec(&chunk_data).map_err(|e| {
                    error!("Failed to serialize chunk data: {e}");
                    anyhow!("Failed to serialize chunk data: {e}")
                })?;
                self.send_chunk(&bytes::Bytes::from(vec), tx).await
            }
            Err(e) => {
                error!("Failed to parse OpenAI stream chunk {data}, {e}");
                self.send_error(tx, format!("Failed to parse OpenAI stream chunk: {e}"))
                    .await
            }
        }
    }

    async fn send_chunk(
        &self,
        chunk: &Bytes,
        tx: &Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        if tx.send(Ok(chunk.clone())).await.is_err() {
            warn!("Failed to send chunk - receiver dropped");
        }
        Ok(())
    }

    async fn send_error(
        &self,
        tx: &Sender<anyhow::Result<Bytes>>,
        error_message: String,
    ) -> anyhow::Result<()> {
        if tx.send(Err(anyhow!(error_message))).await.is_err() {
            warn!("Failed to send error - receiver dropped");
        }
        Ok(())
    }

    pub fn get_default_headers() -> HeaderMap {
        let mut header: HeaderMap = HeaderMap::new();
        header.insert("editor-version", "vscode/1.99.2".parse().unwrap());
        header.insert(
            "editor-plugin-version",
            "copilot-chat/0.20.3".parse().unwrap(),
        );
        header.insert("accept-encoding", "gzip, deflate, br".parse().unwrap());
        header.insert("user-agent", "GithubCopilot/1.155.0".parse().unwrap());
        header.insert("accept", "application/json".parse().unwrap());
        header.insert("content-type", "application/json".parse().unwrap());
        header
    }
}
