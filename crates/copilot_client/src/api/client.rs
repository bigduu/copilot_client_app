use std::{path::PathBuf, sync::Arc};

use anyhow::anyhow;
use async_trait::async_trait;
use bytes::Bytes;
use chat_core::config::{Config, ProxyAuth};
use chat_core::keyword_masking::KeywordMaskingConfig;
use chat_core::paths::keyword_masking_json_path;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use log::{error, info, warn};
use reqwest::{Client, Proxy, Response};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use tauri::http::HeaderMap;
use tokio::sync::{mpsc::Sender, RwLock};

use crate::api::models::{ChatCompletionRequest, ChatCompletionStreamChunk, Content, ContentPart};
use crate::auth::auth_handler::CopilotAuthHandler;
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
#[derive(Debug)]
pub struct CopilotClient {
    state: RwLock<CopilotClientState>,
    keyword_masking_config: KeywordMaskingConfig,
}

#[derive(Debug, Clone)]
struct CopilotClientState {
    client: Arc<ClientWithMiddleware>,
    auth_handler: CopilotAuthHandler,
    models_handler: CopilotModelsHandler,
    config: Config,
    app_data_dir: PathBuf,
}

impl CopilotClient {
    pub fn new(config: Config, app_data_dir: PathBuf) -> Self {
        let client = Self::build_http_client(&config).expect("copilot client");
        let retry_client = Self::build_retry_client(client);
        let shared_client = Arc::new(retry_client);

        let auth_handler = CopilotAuthHandler::new(
            Arc::clone(&shared_client),
            app_data_dir.clone(),
            config.headless_auth,
        );
        let models_handler = CopilotModelsHandler::new(Arc::clone(&shared_client));

        // Load keyword masking config from settings database
        let keyword_masking_config = Self::load_keyword_masking_config();

        CopilotClient {
            state: RwLock::new(CopilotClientState {
                client: shared_client,
                auth_handler,
                models_handler,
                config,
                app_data_dir,
            }),
            keyword_masking_config,
        }
    }

    fn build_http_client(config: &Config) -> anyhow::Result<Client> {
        let mut builder = Client::builder().default_headers(Self::get_default_headers());
        if !config.http_proxy.is_empty() {
            let mut proxy = Proxy::http(&config.http_proxy)?;
            proxy = apply_proxy_auth(proxy, config.http_proxy_auth.as_ref());
            builder = builder.proxy(proxy);
        }
        if !config.https_proxy.is_empty() {
            let mut proxy = Proxy::https(&config.https_proxy)?;
            proxy = apply_proxy_auth(proxy, config.https_proxy_auth.as_ref());
            builder = builder.proxy(proxy);
        }
        builder.build().map_err(|e| anyhow!("Failed to build HTTP client: {e}"))
    }

    fn build_retry_client(client: Client) -> ClientWithMiddleware {
        // Exponential backoff: 1s, 2s, 4s with jitter
        let retry_policy = ExponentialBackoff::builder()
            .base_secs(1)
            .max_retries(3)
            .build();

        ClientBuilder::new(client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build()
    }

    /// Load keyword masking config from the app settings JSON file
    fn load_keyword_masking_config() -> KeywordMaskingConfig {
        let path = keyword_masking_json_path();
        if !path.exists() {
            log::debug!("No keyword masking config found, using default empty config");
            return KeywordMaskingConfig::default();
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(err) => {
                log::warn!("Failed to read keyword masking config: {}", err);
                return KeywordMaskingConfig::default();
            }
        };

        match serde_json::from_str::<KeywordMaskingConfig>(&content) {
            Ok(config) => {
                log::info!(
                    "Loaded keyword masking config with {} entries",
                    config.entries.len()
                );
                config
            }
            Err(err) => {
                log::warn!("Failed to parse keyword masking config: {}", err);
                KeywordMaskingConfig::default()
            }
        }
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

        let (auth_handler, client, config) = {
            let state = self.state.read().await;
            (
                state.auth_handler.clone(),
                state.client.clone(),
                state.config.clone(),
            )
        };

        info!("=== EXCHANGE_CHAT_COMPLETION START ===");
        let access_token = auth_handler.get_chat_token().await.map_err(|e| {
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

        let base_url = config
            .api_base
            .as_deref()
            .unwrap_or("https://api.githubcopilot.com");
        let url = format!("{}/chat/completions", base_url);
        info!("Preparing request with {} messages", request.messages.len());
        if has_images {
            info!("Request contains images, adding vision header");
        }

        // Build request with retry middleware already applied
        let mut request_builder = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", access_token));

        if has_images {
            request_builder = request_builder.header("copilot-vision-request", "true");
        }

        request_builder.json(&request).send().await.map_err(|e| {
            error!("Failed to send chat completion request: {}", e);
            anyhow!("Failed to send chat completion request: {}", e)
        })
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
        let (auth_handler, models_handler) = {
            let state = self.state.read().await;
            (state.auth_handler.clone(), state.models_handler.clone())
        };
        let chat_token = auth_handler.get_chat_token().await?;
        models_handler.get_models(chat_token).await
    }

    async fn update_proxy_auth(&self, auth: Option<ProxyAuth>) -> anyhow::Result<()> {
        let mut state = self.state.write().await;
        state.config.http_proxy_auth = auth.clone();
        state.config.https_proxy_auth = auth;
        let client = Self::build_http_client(&state.config)?;
        let retry_client = Self::build_retry_client(client);
        let shared_client = Arc::new(retry_client);
        state.client = Arc::clone(&shared_client);
        state.auth_handler = CopilotAuthHandler::new(
            Arc::clone(&shared_client),
            state.app_data_dir.clone(),
            state.config.headless_auth,
        );
        state.models_handler = CopilotModelsHandler::new(shared_client);
        Ok(())
    }
}
