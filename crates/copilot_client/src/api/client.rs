use anyhow::anyhow;
use bytes::Bytes;
use log::{error, info, warn};
use reqwest::{Client, Proxy, Response};
use std::{path::PathBuf, sync::Arc};
use tauri::http::HeaderMap;
use tokio::sync::mpsc::Sender;

use crate::api::models::{ChatCompletionRequest, ChatCompletionStreamChunk};
use crate::auth::auth_handler::CopilotAuthHandler;
use crate::config::Config;
use crate::utils::http_utils::execute_request_with_vision;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;

use super::models_handler::CopilotModelsHandler;
use crate::api::models::{Content, ContentPart};
use crate::client_trait::CopilotClientTrait;
use async_trait::async_trait;

const DEFAULT_COPILOT_MODEL: &str = "gpt-4.1";

// Main Copilot Client struct
#[derive(Debug, Clone)]
pub struct CopilotClient {
    client: Arc<Client>,
    auth_handler: CopilotAuthHandler,
    models_handler: CopilotModelsHandler,
    config: Config,
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
            config,
        }
    }

    pub async fn get_models(&self) -> anyhow::Result<Vec<String>> {
        let chat_token = self.auth_handler.get_chat_token().await?;
        self.models_handler.get_models(chat_token).await
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

#[async_trait]
impl CopilotClientTrait for CopilotClient {
    async fn send_chat_completion_request(
        &self,
        mut request: ChatCompletionRequest,
    ) -> anyhow::Result<Response> {
        if request.model.is_empty() {
            request.model = DEFAULT_COPILOT_MODEL.to_string();
        }

        info!("=== EXCHANGE_CHAT_COMPLETION START ===");
        let access_token = self.auth_handler.get_chat_token().await.map_err(|e| {
            info!("Failed to get chat token: {e:?}");
            e
        })?;
        info!("Successfully got chat token");

        let has_images = request.messages.iter().any(|msg| match &msg.content {
            Content::Parts(parts) => parts
                .iter()
                .any(|part| matches!(part, ContentPart::ImageUrl { .. })),
            _ => false,
        });

        let base_url = self
            .config
            .api_base
            .as_deref()
            .unwrap_or("https://api.githubcopilot.com");
        let url = format!("{}/chat/completions", base_url);
        info!("Preparing request with {} messages", request.messages.len());
        if has_images {
            info!("Request contains images, adding vision header");
        }

        execute_request_with_vision(
            &self.client,
            reqwest::Method::POST,
            &url,
            Some(&access_token),
            Some(&request),
            has_images,
        )
        .await
    }

    async fn process_chat_completion_stream(
        &self,
        response: Response,
        tx: Sender<anyhow::Result<Bytes>>,
    ) -> anyhow::Result<()> {
        let mut event_stream = response.bytes_stream().eventsource();
        while let Some(event_result) = event_stream.next().await {
            match event_result {
                Ok(message) => {
                    if message.data == "[DONE]" {
                        info!("Received [DONE] signal, closing stream.");
                        let _ = tx.send(Ok(Bytes::from("[DONE]"))).await;
                        break;
                    }
                    match serde_json::from_str::<ChatCompletionStreamChunk>(&message.data) {
                        Ok(chunk) => {
                            let vec = serde_json::to_vec(&chunk)?;
                            if tx.send(Ok(Bytes::from(vec))).await.is_err() {
                                warn!("Failed to send chunk - receiver dropped.");
                                break;
                            }
                        }
                        Err(e) => {
                            error!(
                                "Failed to parse stream chunk: {}, data: {}",
                                e, message.data
                            );
                        }
                    }
                }
                Err(e) => {
                    error!("Error in SSE stream: {}", e);
                    let _ = tx.send(Err(anyhow!("Error in SSE stream: {}", e))).await;
                    break;
                }
            }
        }
        Ok(())
    }
}
