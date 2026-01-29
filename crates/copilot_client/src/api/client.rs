use std::{path::PathBuf, sync::Arc};

use anyhow::anyhow;
use async_trait::async_trait;
use bytes::Bytes;
use chat_core::config::{Config, ProxyAuth};
use chat_core::keyword_masking::KeywordMaskingConfig;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use log::{error, info, warn};
use reqwest::{Client, Proxy, Response};
use tauri::http::HeaderMap;
use tokio::sync::mpsc::Sender;

use crate::api::models::{ChatCompletionRequest, ChatCompletionStreamChunk, Content, ContentPart};
use crate::auth::auth_handler::CopilotAuthHandler;
use crate::masking::apply_masking;
use crate::utils::http_utils::execute_request_with_vision;
use crate::client_trait::CopilotClientTrait;

use super::models_handler::CopilotModelsHandler;

const DEFAULT_COPILOT_MODEL: &str = "gpt-5-mini";

fn apply_proxy_auth(proxy: Proxy, auth: Option<&ProxyAuth>) -> Proxy {
    let Some(auth) = auth else {
        return proxy;
    };
    if auth.username.is_empty() {
        return proxy;
    }
    proxy.basic_auth(&auth.username, &auth.password)
}

// Main Copilot Client struct
#[derive(Debug, Clone)]
pub struct CopilotClient {
    client: Arc<Client>,
    auth_handler: CopilotAuthHandler,
    models_handler: CopilotModelsHandler,
    config: Config,
    keyword_masking_config: KeywordMaskingConfig,
}

impl CopilotClient {
    pub fn new(config: Config, app_data_dir: PathBuf) -> Self {
        let mut builder = Client::builder().default_headers(Self::get_default_headers());
        if !config.http_proxy.is_empty() {
            let mut proxy = Proxy::http(&config.http_proxy).unwrap();
            proxy = apply_proxy_auth(proxy, config.http_proxy_auth.as_ref());
            builder = builder.proxy(proxy);
        }
        if !config.https_proxy.is_empty() {
            let mut proxy = Proxy::https(&config.https_proxy).unwrap();
            proxy = apply_proxy_auth(proxy, config.https_proxy_auth.as_ref());
            builder = builder.proxy(proxy);
        }
        let client: Client = builder.build().unwrap();
        let shared_client = Arc::new(client);

        let headless_auth = config.headless_auth;
        let auth_handler = CopilotAuthHandler::new(
            Arc::clone(&shared_client),
            app_data_dir.clone(),
            headless_auth,
        );
        let models_handler = CopilotModelsHandler::new(Arc::clone(&shared_client));

        // Load keyword masking config from settings database
        let keyword_masking_config = Self::load_keyword_masking_config(&app_data_dir);

        CopilotClient {
            client: shared_client,
            auth_handler,
            models_handler,
            config,
            keyword_masking_config,
        }
    }

    /// Load keyword masking config from the app settings database
    fn load_keyword_masking_config(app_data_dir: &PathBuf) -> KeywordMaskingConfig {
        let db_path = app_data_dir.join("agents.db");
        
        if let Ok(conn) = rusqlite::Connection::open(&db_path) {
            let result: Result<Option<String>, rusqlite::Error> = conn.query_row(
                "SELECT value FROM app_settings WHERE key = 'keyword_masking_config'",
                [],
                |row| row.get(0),
            );
            
            if let Ok(Some(config_json)) = result {
                if let Ok(config) = serde_json::from_str::<KeywordMaskingConfig>(&config_json) {
                    log::info!("Loaded keyword masking config with {} entries", config.entries.len());
                    return config;
                }
            }
        }
        
        log::debug!("No keyword masking config found, using default empty config");
        KeywordMaskingConfig::default()
    }

    /// Apply keyword masking to all message content in the request
    fn apply_keyword_masking_to_request(&self, request: &mut ChatCompletionRequest) {
        if self.keyword_masking_config.entries.is_empty() {
            return;
        }

        for message in &mut request.messages {
            match &mut message.content {
                Content::Text(text) => {
                    *text = self.keyword_masking_config.apply_masking(text);
                }
                Content::Parts(parts) => {
                    for part in parts {
                        if let ContentPart::Text { text } = part {
                            *text = self.keyword_masking_config.apply_masking(text);
                        }
                    }
                }
            }
        }

        log::debug!("Applied keyword masking to {} messages", request.messages.len());
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

        // Apply keyword masking to message content
        self.apply_keyword_masking_to_request(&mut request);

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

    async fn get_models(&self) -> anyhow::Result<Vec<String>> {
        let chat_token = self.auth_handler.get_chat_token().await?;
        self.models_handler.get_models(chat_token).await
    }
}
