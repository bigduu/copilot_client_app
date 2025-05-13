use anyhow::{anyhow, Error};
use std::{
    collections::HashMap,
    fs::{create_dir_all, read_to_string, File},
    io::Write,
    path::PathBuf,
    time::Duration,
};

use bytes::Bytes;
use lazy_static::lazy_static;
use log::{debug, error, info, warn};
use reqwest::{Client, Proxy, Response};
use tauri::http::HeaderMap;
use tokio::sync::Mutex;
use tokio::sync::{mpsc, mpsc::Sender};
use tokio::time::sleep;

use crate::copilot::{block_model, sse::extract_sse_message, stream_model::ChatCompletionRequest};

use super::{
    config::Config,
    stream_model::{AccessTokenResponse, CopilotConfig, DeviceCodeResponse, Message, StreamChunk},
};

// Add a static variable to store the models
lazy_static! {
    static ref CACHED_MODELS: Mutex<Option<Vec<String>>> = Mutex::new(None);
}

#[derive(Debug)]
pub struct CopilotClient {
    client: Client,
    app_data_dir: PathBuf,
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

        CopilotClient {
            client,
            app_data_dir,
        }
    }

    async fn get_chat_token(&self) -> anyhow::Result<String> {
        // Create the directory if it doesn't exist
        create_dir_all(&self.app_data_dir)?;

        let token_path = self.app_data_dir.join(".token");

        //read the access token from the .token file if exists don't get the device code and access token
        if token_path.exists() {
            let access_token = read_to_string(&token_path)?;
            let access_token = AccessTokenResponse::from_token(access_token);
            match self.get_copilot_token(access_token).await {
                Ok(copilot_config) => {
                    return Ok(copilot_config.token);
                }
                Err(e) => {
                    //remove the .token file
                    std::fs::remove_file(&token_path)?;
                    info!(
                        "Failed to get copilot config, will get the device code and access token: {e}"
                    );
                }
            };
        }
        let device_code = self.get_device_code().await?;
        let access_token = self.get_access_token(device_code).await?;
        //make sure the .token file is writable and write the access token to it
        let mut file = File::create(&token_path)?;
        file.write_all(access_token.clone().access_token.unwrap().as_bytes())?;
        let copilot_config = self.get_copilot_token(access_token).await?;
        Ok(copilot_config.token)
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
        let access_token = match self.get_chat_token().await {
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
}

// Models relate code
impl CopilotClient {
    pub async fn get_models(&self) -> anyhow::Result<Vec<String>> {
        // First, check if we have cached models
        let mut cached = CACHED_MODELS.lock().await;
        if let Some(models) = cached.as_ref() {
            info!("Returning cached models");
            Ok(models.clone())
        } else {
            let models = self.do_get_models().await?;
            *cached = Some(models.clone());
            Ok(models)
        }
    }

    async fn do_get_models(&self) -> anyhow::Result<Vec<String>> {
        info!("=== GET_MODELS START ===");
        let start_time = std::time::Instant::now();

        let access_token = match self.get_chat_token().await {
            Ok(token) => {
                info!("Successfully got chat token");
                token
            }
            Err(e) => {
                info!("Failed to get chat token: {e:?}");
                return Err(e);
            }
        };

        let url = "https://api.githubcopilot.com/models";
        info!("Fetching available models...");

        let response = match self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {access_token}"))
            .send()
            .await
        {
            Ok(resp) => {
                info!(
                    "Got response from Copilot API after {:?}",
                    start_time.elapsed()
                );
                info!("Response status: {}", resp.status());
                resp
            }
            Err(e) => {
                let error_msg = format!("Failed to fetch models: {e}");
                error!("{error_msg}");
                return Err(anyhow::anyhow!(error_msg));
            }
        };

        match response.status() {
            reqwest::StatusCode::OK => Self::extract_model_from_response(response).await,
            s => {
                let body = response.text().await.unwrap_or_default();
                let error_msg = format!("Failed to get models: {body} with status {s}");
                error!("{error_msg}");
                Err(anyhow::anyhow!(error_msg))
            }
        }
    }

    async fn extract_model_from_response(response: Response) -> Result<Vec<String>, Error> {
        let models: serde_json::Value = response.json().await?;
        info!("Models: {models:?}");

        // Extract model IDs from the response
        let model_ids = if let Some(data) = models.get("data").and_then(|d| d.as_array()) {
            data.iter()
                .filter_map(|model| {
                    let id = model.get("id").and_then(|id| id.as_str())?;
                    let model_picker_enabled = model
                        .get("model_picker_enabled")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);

                    // Only include models where model_picker_enabled is true
                    if model_picker_enabled {
                        Some(id.to_string())
                    } else {
                        None
                    }
                })
                .collect::<Vec<String>>()
        } else {
            return Err(anyhow::anyhow!("Invalid models response format"));
        };

        info!("=== GET_MODELS COMPLETE ===");
        Ok(model_ids)
    }
}

// auth-related code
impl CopilotClient {
    async fn get_device_code(&self) -> anyhow::Result<DeviceCodeResponse> {
        let params = HashMap::from([
            ("client_id", "Iv1.b507a08c87ecfe98"),
            ("scope", "read:user"),
        ]);
        let response = self
            .client
            .post("https://github.com/login/device/code")
            .query(&params)
            .send()
            .await?
            .json::<DeviceCodeResponse>()
            .await?;
        Ok(response)
    }

    async fn get_access_token(
        &self,
        device_code: DeviceCodeResponse,
    ) -> anyhow::Result<AccessTokenResponse> {
        let params = HashMap::from([
            ("client_id", "Iv1.b507a08c87ecfe98"),
            ("device_code", &device_code.device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("expires_in", "3600"),
        ]);
        use arboard::Clipboard;
        use webbrowser;
        let mut clipboard = Clipboard::new()?;
        clipboard.set_text(device_code.user_code.clone())?;

        // Show a dialog to the user using rfd
        let dialog_message = format!(
            "User code '{}' has been copied to your clipboard. Please paste it into the GitHub page that will open next.",
            device_code.user_code
        );
        rfd::MessageDialog::new()
            .set_title("User Code Copied")
            .set_description(&dialog_message)
            .set_level(rfd::MessageLevel::Info)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();

        webbrowser::open(&device_code.verification_uri)?;
        loop {
            let response = self
                .client
                .post("https://github.com/login/oauth/access_token")
                .query(&params)
                .send()
                .await?
                .json::<AccessTokenResponse>()
                .await?;
            if response.access_token.is_some() {
                return Ok(response);
            }
            sleep(Duration::from_secs(10)).await;
        }
    }

    async fn get_copilot_token(
        &self,
        access_token: AccessTokenResponse,
    ) -> anyhow::Result<CopilotConfig> {
        let response = self
            .client
            .get("https://api.github.com/copilot_internal/v2/token")
            .header(
                "Authorization",
                format!("token {}", access_token.access_token.unwrap()),
            )
            .send()
            .await?;
        let body = response.bytes().await?;
        match serde_json::from_slice::<CopilotConfig>(&body) {
            Ok(copilot_config) => Ok(copilot_config),
            Err(_) => {
                let body = String::from_utf8_lossy(&body);
                let error_msg = format!("Failed to get copilot config: {body}");
                error!("{error_msg}");
                Err(anyhow::anyhow!(error_msg))
            }
        }
    }
}

impl CopilotClient {
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
