use std::{
    collections::HashMap,
    fs::{read_to_string, File},
    io::Write,
    path::PathBuf,
    time::Duration,
};

use lazy_static::lazy_static;
use reqwest::{Client, Proxy, Response};
use serde::{de::DeserializeOwned, Serialize};
use tauri::{
    http::{HeaderMap, HeaderName},
    ipc::Channel,
};
use tokio::time::sleep;
use tokio::{io::AsyncReadExt, sync::Mutex};

use crate::copilot::model::ChatCompletionRequest;

use super::{
    config::Config,
    model::{AccessTokenResponse, CopilotConfig, DeviceCodeResponse, Message},
};

// Add a static variable to store the models
lazy_static! {
    static ref CACHED_MODELS: Mutex<Option<Vec<String>>> = Mutex::new(None);
}

#[derive(Debug)]
pub struct CopilotClinet {
    client: reqwest::Client,
    app_data_dir: PathBuf,
}

impl CopilotClinet {
    pub fn new(config: Config, app_data_dir: PathBuf) -> Self {
        let mut header: HeaderMap = HeaderMap::new();
        header.insert(
            HeaderName::from_static("editor-version"),
            "Neovim/0.6.1".parse().unwrap(),
        );
        header.insert(
            HeaderName::from_static("editor-plugin-version"),
            "copilot.vim/1.16.0".parse().unwrap(),
        );
        header.insert(
            HeaderName::from_static("accept-encoding"),
            "gzip, deflate, br".parse().unwrap(),
        );
        header.insert(
            HeaderName::from_static("user-agent"),
            "GithubCopilot/1.155.0".parse().unwrap(),
        );
        header.insert(
            HeaderName::from_static("accept"),
            "application/json".parse().unwrap(),
        );
        header.insert(
            HeaderName::from_static("content-type"),
            "application/json".parse().unwrap(),
        );
        let mut builder = Client::builder().default_headers(header);
        if !config.http_proxy.is_empty() {
            builder = builder.proxy(Proxy::http(&config.http_proxy).unwrap());
        }
        if !config.https_proxy.is_empty() {
            builder = builder.proxy(Proxy::https(&config.https_proxy).unwrap());
        }
        let client: Client = builder.build().unwrap();

        CopilotClinet {
            client,
            app_data_dir,
        }
    }

    async fn get_chat_token(&self) -> anyhow::Result<String> {
        // Create the directory if it doesn't exist
        std::fs::create_dir_all(&self.app_data_dir)?;

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
                    println!(
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

    pub async fn exchange_chat_completion(
        &self,
        messages: Vec<Message>,
        channel: Channel<String>,
        model: Option<String>,
    ) -> anyhow::Result<()> {
        println!("=== EXCHANGE_CHAT_COMPLETION START ===");
        let start_time = std::time::Instant::now();

        let access_token = match self.get_chat_token().await {
            Ok(token) => {
                println!("Successfully got chat token");
                token
            }
            Err(e) => {
                println!("Failed to get chat token: {e:?}");
                return Err(e);
            }
        };

        let mut headers = HeaderMap::new();
        headers.insert("Editor-Version", "vscode/1.90.0".parse()?);
        headers.insert("Editor-Plugin-Version", "copilot-chat/0.20.3".parse()?);
        headers.insert("User-Agent", "GitHubCopilot/1.155.0".parse()?);
        headers.insert("Content-Type", "application/json".parse()?);
        headers.insert("Authorization", format!("Bearer {access_token}").parse()?);

        let url = "https://api.githubcopilot.com/chat/completions";
        println!("Preparing request with {} messages", messages.len());

        // Use the provided model or fall back to default
        let model = model.unwrap_or_else(|| "gpt-4.1".to_string());
        let request = ChatCompletionRequest::new(model, messages);

        // Create the request
        println!("Sending request to Copilot API...");
        let response = match self
            .client
            .post(url)
            .headers(headers)
            .json(&request)
            .send()
            .await
        {
            Ok(resp) => {
                println!(
                    "Got response from Copilot API after {:?}",
                    start_time.elapsed()
                );
                println!("Response status: {}", resp.status());

                // Log headers for debugging
                println!("Response headers:");
                for (name, value) in resp.headers() {
                    println!("  {name}: {value:?}");
                }

                resp
            }
            Err(e) => {
                let error_msg = format!("Failed to send request: {e}");
                println!("{error_msg}");
                // Send error message to frontend
                channel.send(format!(
                    r#"{{"error": "{}"}}"#,
                    error_msg.replace("\"", "\\\"")
                ))?;
                return Ok(());
            }
        };

        // Check status code
        match response.status() {
            reqwest::StatusCode::OK => {
                println!("Reading response body as stream...");
                let mut stream = response.bytes_stream();
                let mut buffer = String::new();

                use futures_util::StreamExt;
                while let Some(chunk) = stream.next().await {
                    match chunk {
                        Ok(bytes) => {
                            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                                buffer.push_str(&text);
                                // Process complete lines
                                while let Some(pos) = buffer.find("\n\n") {
                                    let line = buffer[..pos].trim().to_string();
                                    if !line.is_empty() {
                                        println!("Sending line: {line}");
                                        channel.send(line)?;
                                    }
                                    buffer = buffer[pos + 1..].to_string();
                                }
                            }
                        }
                        Err(e) => {
                            let error_msg = format!("Error reading stream: {e}");
                            println!("{error_msg}");
                            channel.send(format!(
                                r#"{{"error": "{}"}}"#,
                                error_msg.replace("\"", "\\\"")
                            ))?;
                            break;
                        }
                    }
                }

                // Send any remaining data in buffer
                if !buffer.is_empty() {
                    channel.send(buffer)?;
                }

                println!("=== EXCHANGE_CHAT_COMPLETION COMPLETE ===");
                Ok(())
            }
            s => {
                let body = match response.text().await {
                    Ok(text) => text,
                    Err(e) => format!("Failed to read error response: {e}"),
                };

                let error_msg =
                    format!("Failed to exchange chat completion: {body} with status {s}");
                println!("{error_msg}");

                // Send error message to frontend
                channel.send(format!(
                    r#"{{"error": "{}"}}"#,
                    error_msg.replace("\"", "\\\"")
                ))?;

                println!("=== EXCHANGE_CHAT_COMPLETION FAILED ===");
                Ok(())
            }
        }
    }

    pub async fn get_models(&self) -> anyhow::Result<Vec<String>> {
        // First check if we have cached models
        let mut cached = CACHED_MODELS.lock().await;
        if let Some(models) = cached.as_ref() {
            println!("Returning cached models");
            Ok(models.clone())
        } else {
            let models = self.do_get_models().await?;
            *cached = Some(models.clone());
            Ok(models)
        }
    }

    async fn do_get_models(&self) -> anyhow::Result<Vec<String>> {
        println!("=== GET_MODELS START ===");
        let start_time = std::time::Instant::now();

        let access_token = match self.get_chat_token().await {
            Ok(token) => {
                println!("Successfully got chat token");
                token
            }
            Err(e) => {
                println!("Failed to get chat token: {e:?}");
                return Err(e);
            }
        };

        let mut headers = HeaderMap::new();
        headers.insert("Editor-Version", "vscode/1.90.0".parse()?);
        headers.insert("Editor-Plugin-Version", "copilot-chat/0.20.3".parse()?);
        headers.insert("User-Agent", "GitHubCopilot/1.155.0".parse()?);
        headers.insert("Content-Type", "application/json".parse()?);
        headers.insert("Authorization", format!("Bearer {access_token}").parse()?);

        let url = "https://api.githubcopilot.com/models";
        println!("Fetching available models...");

        let response = match self.client.get(url).headers(headers).send().await {
            Ok(resp) => {
                println!(
                    "Got response from Copilot API after {:?}",
                    start_time.elapsed()
                );
                println!("Response status: {}", resp.status());
                resp
            }
            Err(e) => {
                let error_msg = format!("Failed to fetch models: {e}");
                println!("{error_msg}");
                return Err(anyhow::anyhow!(error_msg));
            }
        };

        match response.status() {
            reqwest::StatusCode::OK => {
                let decompressed = self.decompressed_response(response).await?;
                let models: serde_json::Value = serde_json::from_str(&decompressed)?;
                println!("Models: {models:?}");

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

                println!("=== GET_MODELS COMPLETE ===");
                Ok(model_ids)
            }
            s => {
                let body = response.text().await.unwrap_or_default();
                let error_msg = format!("Failed to get models: {body} with status {s}");
                println!("{error_msg}");
                Err(anyhow::anyhow!(error_msg))
            }
        }
    }
}

impl CopilotClinet {
    async fn get_device_code(&self) -> anyhow::Result<DeviceCodeResponse> {
        let params = HashMap::from([
            ("client_id", "Iv1.b507a08c87ecfe98"),
            ("scope", "read:user"),
        ]);
        let response = self
            .send_post_request::<_, DeviceCodeResponse>(
                "https://github.com/login/device/code",
                &params,
            )
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
                .send_post_request::<_, AccessTokenResponse>(
                    "https://github.com/login/oauth/access_token",
                    &params,
                )
                .await?;
            if response.access_token.is_some() {
                return Ok(response);
            }
            sleep(Duration::from_secs(10)).await;
        }
    }

    fn get_copilot_token_header(&self, access_token: AccessTokenResponse) -> HeaderMap {
        let mut header: HeaderMap = HeaderMap::new();
        header.insert("Editor-Version", "Neovim/0.6.1".parse().unwrap());
        header.insert(
            "Editor-Plugin-Version",
            "copilot.vim/1.16.0".parse().unwrap(),
        );
        header.insert("Content-Type", "application/json".parse().unwrap());
        header.insert("Accept-Encoding", "gzip, deflate, br".parse().unwrap());
        header.insert("User-Agent", "GithubCopilot/1.155.0".parse().unwrap());
        header.insert("Accept", "application/json".parse().unwrap());
        header.insert(
            "Authorization",
            format!("token {}", access_token.access_token.unwrap())
                .parse()
                .unwrap(),
        );
        header
    }

    async fn get_copilot_token(
        &self,
        access_token: AccessTokenResponse,
    ) -> anyhow::Result<CopilotConfig> {
        let headers = self.get_copilot_token_header(access_token.clone());
        let response = self
            .client
            .get("https://api.github.com/copilot_internal/v2/token")
            .headers(headers)
            .send()
            .await?;
        let decompressed = self.decompressed_response(response).await?;
        let data: CopilotConfig = match serde_json::from_str(&decompressed) {
            Ok(data) => data,
            Err(e) => {
                eprintln!("Failed to parse copilot config: {e}, the response is: {decompressed}",);
                return Err(anyhow::anyhow!("Failed to parse copilot config: {}", e));
            }
        };
        Ok(data)
    }

    async fn send_post_request<DATA: Serialize, T: DeserializeOwned>(
        &self,
        url: &str,
        data: &DATA,
    ) -> anyhow::Result<T> {
        match self.client.post(url).json(data).send().await {
            Ok(response) => {
                let decompressed = self.decompressed_response(response).await?;
                let data: T = serde_json::from_str(&decompressed)?;
                Ok(data)
            }
            Err(e) => {
                eprintln!("Failed to send request: {e}",);
                Err(anyhow::anyhow!("Failed to send request: {e}"))
            }
        }
    }

    async fn decompressed_response(&self, response: Response) -> anyhow::Result<String> {
        let encoding = response
            .headers()
            .get("Content-Encoding")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("identity");

        let decompressed = match encoding {
            "gzip" => {
                let body = response.bytes().await?;
                let mut decoder =
                    async_compression::tokio::bufread::GzipDecoder::new(body.as_ref());
                let mut decompressed = String::new();
                AsyncReadExt::read_to_string(&mut decoder, &mut decompressed).await?;
                decompressed
            }
            _ => {
                let body = response.bytes().await?;
                String::from_utf8(body.to_vec())?
            }
        };
        Ok(decompressed)
    }
}
