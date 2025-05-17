use anyhow::anyhow;
use log::{error, info};
use reqwest::Client;
use std::{
    collections::HashMap,
    fs::{create_dir_all, read_to_string, File},
    io::Write,
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tokio::time::sleep;

// This will be adjusted later once model/stream_model.rs is in place
use crate::copilot::model::stream_model::{AccessTokenResponse, CopilotConfig, DeviceCodeResponse};

// Struct for handling authentication logic
#[derive(Debug, Clone)]
pub(crate) struct CopilotAuthHandler {
    client: Arc<Client>,
    app_data_dir: PathBuf,
}

impl CopilotAuthHandler {
    pub(crate) fn new(client: Arc<Client>, app_data_dir: PathBuf) -> Self {
        CopilotAuthHandler {
            client,
            app_data_dir,
        }
    }

    // get_chat_token remains in CopilotClient, delegates to auth_handler
    pub(crate) async fn get_chat_token(&self) -> anyhow::Result<String> {
        // Create the directory if it doesn't exist
        create_dir_all(&self.app_data_dir)?;

        let token_path = self.app_data_dir.join(".token");

        //read the access token from the .token file if exists don't get the device code and access token
        if token_path.exists() {
            let access_token_str = read_to_string(&token_path)?;
            let access_token = AccessTokenResponse::from_token(access_token_str);
            // Delegate to auth_handler
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
        // Delegate to auth_handler
        let device_code = self.get_device_code().await?;
        // Delegate to auth_handler
        let access_token = self.get_access_token(device_code).await?;
        //make sure the .token file is writable and write the access token to it
        let mut file = File::create(&token_path)?;
        file.write_all(access_token.clone().access_token.unwrap().as_bytes())?;
        // Delegate to auth_handler
        let copilot_config = self.get_copilot_token(access_token).await?;
        Ok(copilot_config.token)
    }

    pub(super) async fn get_device_code(&self) -> anyhow::Result<DeviceCodeResponse> {
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

    pub(super) async fn get_access_token(
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

    pub(super) async fn get_copilot_token(
        &self,
        access_token: AccessTokenResponse,
    ) -> anyhow::Result<CopilotConfig> {
        let url = "https://api.github.com/copilot_internal/v2/token";
        let actual_github_token = access_token
            .access_token
            .ok_or_else(|| anyhow!("Access token not found"))?;

        let response = self
            .client
            .get(url)
            .header("Authorization", format!("token {}", actual_github_token))
            .send()
            .await?;

        let body = response.bytes().await?;
        match serde_json::from_slice::<CopilotConfig>(&body) {
            Ok(copilot_config) => Ok(copilot_config),
            Err(_) => {
                let body_str = String::from_utf8_lossy(&body);
                let error_msg = format!("Failed to get copilot config: {body_str}");
                error!("{error_msg}");
                Err(anyhow!(error_msg))
            }
        }
    }
}
