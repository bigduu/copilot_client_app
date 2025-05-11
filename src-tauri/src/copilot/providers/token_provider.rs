use std::{
    collections::HashMap,
    fs::{read_to_string, File},
    io::Write,
    path::PathBuf,
    time::Duration,
};

use async_trait::async_trait;
use llm_proxy_core::{Error, TokenProvider};
use tauri::http::HeaderMap;
use tokio::time::sleep;

use crate::copilot::model::{AccessTokenResponse, CopilotConfig, DeviceCodeResponse};

const CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";

pub struct CopilotTokenProvider {
    client: reqwest::Client,
    app_data_dir: PathBuf,
}

impl CopilotTokenProvider {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let mut header = HeaderMap::new();
        header.insert("Editor-Version", "Neovim/0.6.1".parse().unwrap());
        header.insert(
            "Editor-Plugin-Version",
            "copilot.vim/1.16.0".parse().unwrap(),
        );
        header.insert("Content-Type", "application/json".parse().unwrap());
        header.insert("Accept-Encoding", "gzip".parse().unwrap());
        header.insert("User-Agent", "GithubCopilot/1.155.0".parse().unwrap());
        header.insert("Accept", "application/json".parse().unwrap());

        Self {
            app_data_dir,
            client: reqwest::Client::builder()
                .gzip(true)
                .default_headers(header)
                .build()
                .expect("Failed to create reqwest client"),
        }
    }

    async fn get_device_code(&self) -> anyhow::Result<DeviceCodeResponse> {
        let params = HashMap::from([("client_id", CLIENT_ID), ("scope", "read:user")]);
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
            ("client_id", CLIENT_ID),
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
        let mut headers = HeaderMap::new();
        headers.insert(
            "Authorization",
            format!("token {}", access_token.access_token.unwrap())
                .parse()
                .unwrap(),
        );
        let response = self
            .client
            .get("https://api.github.com/copilot_internal/v2/token")
            .headers(headers)
            .send()
            .await?
            .json::<CopilotConfig>()
            .await?;
        Ok(response)
    }

    async fn refresh_token(&self) -> anyhow::Result<String> {
        // Create the directory if it doesn't exist
        std::fs::create_dir_all(&self.app_data_dir)?;

        let token_path = self.app_data_dir.join(".token");

        // Get new device code & access token
        let device_code = self.get_device_code().await?;
        let access_token = self.get_access_token(device_code).await?;

        // Save the access token
        let mut file = File::create(&token_path)?;
        file.write_all(access_token.clone().access_token.unwrap().as_bytes())?;

        // Get the copilot token
        let copilot_config = self.get_copilot_token(access_token).await?;
        Ok(copilot_config.token)
    }
}

#[async_trait]
impl TokenProvider for CopilotTokenProvider {
    async fn get_token(&self) -> Result<String, Error> {
        let token_path = self.app_data_dir.join(".token");

        if token_path.exists() {
            // Try using existing access token
            match read_to_string(&token_path) {
                Ok(access_token) => {
                    let access_token = AccessTokenResponse::from_token(access_token);
                    match self.get_copilot_token(access_token).await {
                        Ok(copilot_config) => return Ok(copilot_config.token),
                        Err(_) => {
                            // Remove invalid token file
                            let _ = std::fs::remove_file(&token_path);
                        }
                    }
                }
                Err(_) => {
                    // Remove corrupted token file
                    let _ = std::fs::remove_file(&token_path);
                }
            }
        }

        // Get fresh token if needed
        self.refresh_token()
            .await
            .map_err(|e| Error::AuthenticationError(e.to_string()))
    }
}
