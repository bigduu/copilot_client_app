use anyhow::anyhow;
use bytes::Bytes;
use lazy_static::lazy_static;
use log::{error, info, warn};
use reqwest::{Client, Proxy, Response};
use std::{path::PathBuf, sync::Arc};
use tauri::http::HeaderMap;
use tokio::sync::mpsc::Sender;
use tokio::sync::Mutex;

use crate::copilot::{block_model, sse::extract_sse_message, stream_model::ChatCompletionRequest};

use super::{
    auth_handler::CopilotAuthHandler,
    config::Config,
    models_handler::CopilotModelsHandler,
    stream_model::{Message, StreamChunk},
};

// Add a static variable to store the models
lazy_static! {
    static ref CACHED_MODELS: Mutex<Option<Vec<String>>> = Mutex::new(None);
}

// Main Copilot Client struct
#[derive(Debug)]
pub struct CopilotClient {
    client: Arc<Client>, // CopilotClient owns the Arc
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
        let shared_client = Arc::new(client); // Create the Arc

        // Create handlers, passing a clone of the Arc
        let auth_handler = CopilotAuthHandler::new(Arc::clone(&shared_client), app_data_dir);
        let models_handler = CopilotModelsHandler::new(Arc::clone(&shared_client));

        CopilotClient {
            client: shared_client, // Store the Arc
            auth_handler,
            models_handler,
        }
    }

    // Public method to get models, delegates to models_handler
    pub async fn get_models(&self) -> anyhow::Result<Vec<String>> {
        let chat_token = self.auth_handler.get_chat_token().await?;
        self.models_handler.get_models(chat_token).await
    }

    pub async fn send_block_request(
        &self,
        messages: Vec<Message>,
        tx: Sender<anyhow::Result<Bytes>>,
        model: Option<String>,
    ) -> anyhow::Result<()> {
        // Use the provided model or fall back to default
        let model = model.unwrap_or_else(|| "gpt-4.1".to_string());
        let request = ChatCompletionRequest::new_block(model, messages.clone());
        let response = self.send_request(messages, &request).await?;
        let response = response.json::<block_model::Response>().await?;
        let first = response.choices.first().unwrap();
        info!("{}", first.message.content.clone());
        tx.send(Ok(bytes::Bytes::from(first.message.content.clone())))
            .await
            .map_err(|_| anyhow!("Failed to send response"))?;
        tx.send(Ok(bytes::Bytes::from("[DONE]")))
            .await
            .map_err(|_| anyhow!("Failed to send [DONE]"))?;
        Ok(())
    }

    pub async fn send_stream_request(
        &self,
        messages: Vec<Message>,
        tx: Sender<anyhow::Result<Bytes>>,
        model: Option<String>,
    ) -> anyhow::Result<()> {
        // Use the provided model or fall back to default
        let model = model.unwrap_or_else(|| "gpt-4.1".to_string());
        let request = ChatCompletionRequest::new_stream(model, messages.clone());
        let response = self.send_request(messages, &request).await?;

        Ok(self.forward_message(response, tx).await?)
    }

    async fn send_request(
        &self,
        messages: Vec<Message>,
        request: &ChatCompletionRequest,
    ) -> anyhow::Result<Response> {
        info!("=== EXCHANGE_CHAT_COMPLETION START ===");
        let start_time = std::time::Instant::now();
        let access_token = match self.auth_handler.get_chat_token().await {
            Ok(token) => {
                info!("Successfully got chat token");
                token
            }
            Err(e) => {
                info!("Failed to get chat token: {e:?}");
                return Err(e);
            }
        };

        let url = "https://api.githubcopilot.com/chat/completions";
        info!("Preparing request with {} messages", messages.len());

        // Create the request
        info!("Sending request to Copilot API...");
        let response = match self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {access_token}"))
            .json(&request)
            .send()
            .await
        {
            Ok(resp) => {
                info!(
                    "Got response from Copilot API after {:?}",
                    start_time.elapsed()
                );
                info!("Response status: {}", resp.status());

                // Log headers for debugging
                info!("Response headers:");
                for (name, value) in resp.headers() {
                    info!("{name}: {value:?}");
                }

                resp
            }
            Err(e) => {
                let error_msg = format!("Failed to send request: {e}");
                error!("{error_msg}");
                return Err(anyhow!(error_msg));
            }
        };
        Ok(response)
    }

    async fn forward_message(
        &self,
        response: Response,
        tx: Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        use futures_util::StreamExt;
        // handle the response stream
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    let text = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&text);
                    while let Some((message, remaining)) = extract_sse_message(&buffer) {
                        buffer = remaining.to_string();
                        if message.trim() == "[DONE]" {
                            info!("Received [DONE] signal");
                            break;
                        }
                        self.process_message(&message, &tx).await?;
                    }
                }
                Err(e) => {
                    self.send_error(&tx, format!("Error reading chunk from OpenAI: {e}"))
                        .await?;
                }
            }
        }

        // Process any remaining data in the buffer
        if !buffer.is_empty() {
            if let Some((message, _)) = extract_sse_message(&buffer) {
                self.process_message(&message, &tx).await?;
            }
        }
        Ok(())
    }

    /// Parse the chunk data and send it through the channel
    async fn process_message(
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

    /// Send a chunk through the channel
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

    /// Send an error message through the channel
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
