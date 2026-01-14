use anyhow::anyhow;
use lazy_static::lazy_static;
use log::{error, info};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{create_dir_all, read_to_string, File},
    io::Write,
    path::PathBuf,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use tokio::time::sleep;

// Models for GitHub authentication flow
#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct CopilotConfig {
    pub token: String,
    // Other fields are not used directly by the auth handler, but are kept for completeness
    pub annotations_enabled: bool,
    pub chat_enabled: bool,
    pub chat_jetbrains_enabled: bool,
    pub code_quote_enabled: bool,
    pub code_review_enabled: bool,
    pub codesearch: bool,
    pub copilotignore_enabled: bool,
    pub endpoints: Endpoints,
    pub expires_at: u64,
    pub individual: bool,
    pub limited_user_quotas: Option<String>,
    pub limited_user_reset_date: Option<String>,
    pub prompt_8k: bool,
    pub public_suggestions: String,
    pub refresh_in: u64,
    pub sku: String,
    pub snippy_load_test_enabled: bool,
    pub telemetry: String,
    pub tracking_id: String,
    pub vsc_electron_fetcher_v2: bool,
    pub xcode: bool,
    pub xcode_chat: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_config(expires_at: u64) -> CopilotConfig {
        CopilotConfig {
            token: "cached-token".to_string(),
            annotations_enabled: false,
            chat_enabled: true,
            chat_jetbrains_enabled: false,
            code_quote_enabled: false,
            code_review_enabled: false,
            codesearch: false,
            copilotignore_enabled: false,
            endpoints: Endpoints {
                api: Some("https://api.example.com".to_string()),
                origin_tracker: None,
                proxy: None,
                telemetry: None,
            },
            expires_at,
            individual: true,
            limited_user_quotas: None,
            limited_user_reset_date: None,
            prompt_8k: false,
            public_suggestions: "disabled".to_string(),
            refresh_in: 300,
            sku: "test".to_string(),
            snippy_load_test_enabled: false,
            telemetry: "disabled".to_string(),
            tracking_id: "test".to_string(),
            vsc_electron_fetcher_v2: false,
            xcode: false,
            xcode_chat: false,
        }
    }

    #[test]
    fn read_access_token_trims() {
        let dir = tempdir().expect("tempdir");
        let token_path = dir.path().join(".token");
        std::fs::write(&token_path, "  token-value \n").expect("write token");

        let token = CopilotAuthHandler::read_access_token(&token_path);
        assert_eq!(token.as_deref(), Some("token-value"));
    }

    #[test]
    fn cached_copilot_config_round_trip() {
        let dir = tempdir().expect("tempdir");
        let handler = CopilotAuthHandler::new(Arc::new(Client::new()), dir.path().to_path_buf());
        let token_path = dir.path().join(".copilot_token.json");
        let config = sample_config(1234567890);

        handler
            .write_cached_copilot_config(&token_path, &config)
            .expect("write cache");
        let loaded = handler
            .read_cached_copilot_config(&token_path)
            .expect("read cache");

        assert_eq!(loaded.token, config.token);
        assert_eq!(loaded.expires_at, config.expires_at);
    }

    #[test]
    fn copilot_token_expiry_buffer() {
        let dir = tempdir().expect("tempdir");
        let handler = CopilotAuthHandler::new(Arc::new(Client::new()), dir.path().to_path_buf());
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0);

        let valid = sample_config(now + 120);
        let stale = sample_config(now + 30);

        assert!(handler.is_copilot_token_valid(&valid));
        assert!(!handler.is_copilot_token_valid(&stale));
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct Endpoints {
    pub api: Option<String>,
    pub origin_tracker: Option<String>,
    pub proxy: Option<String>,
    pub telemetry: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<u64>,
    pub interval: Option<u64>,
    pub scope: Option<String>,
    pub error: Option<String>,
}
impl AccessTokenResponse {
    pub(crate) fn from_token(token: String) -> Self {
        Self {
            access_token: Some(token),
            token_type: None,
            expires_in: None,
            interval: None,
            scope: None,
            error: None,
        }
    }
}

// Global static lock for get_chat_token
lazy_static! {
    static ref CHAT_TOKEN_LOCK: Mutex<()> = Mutex::new(());
}

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
        // Acquire global lock to ensure sequential execution
        let _guard = CHAT_TOKEN_LOCK.lock().await;

        // Create the directory if it doesn't exist
        create_dir_all(&self.app_data_dir)?;
        info!("The app dir is {:?}", self.app_data_dir.clone());

        let token_path = self.app_data_dir.join(".token");
        let copilot_token_path = self.app_data_dir.join(".copilot_token.json");

        if let Some(cached_config) = self.read_cached_copilot_config(&copilot_token_path) {
            if self.is_copilot_token_valid(&cached_config) {
                return Ok(cached_config.token);
            }
            let _ = std::fs::remove_file(&copilot_token_path);
        }

        //read the access token from the .token file if exists don't get the device code and access token
        if let Some(access_token_str) = Self::read_access_token(&token_path) {
            let access_token = AccessTokenResponse::from_token(access_token_str);
            // Delegate to auth_handler
            match self.get_copilot_token(access_token).await {
                Ok(copilot_config) => {
                    self.write_cached_copilot_config(&copilot_token_path, &copilot_config)?;
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
        self.write_cached_copilot_config(&copilot_token_path, &copilot_config)?;
        Ok(copilot_config.token)
    }

    fn read_access_token(token_path: &PathBuf) -> Option<String> {
        if !token_path.exists() {
            return None;
        }
        let access_token_str = read_to_string(token_path).ok()?;
        let trimmed = access_token_str.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    fn read_cached_copilot_config(&self, token_path: &PathBuf) -> Option<CopilotConfig> {
        let cached_str = read_to_string(token_path).ok()?;
        serde_json::from_str::<CopilotConfig>(&cached_str).ok()
    }

    fn write_cached_copilot_config(
        &self,
        token_path: &PathBuf,
        copilot_config: &CopilotConfig,
    ) -> anyhow::Result<()> {
        let serialized = serde_json::to_string(copilot_config)?;
        let mut file = File::create(token_path)?;
        file.write_all(serialized.as_bytes())?;
        Ok(())
    }

    fn is_copilot_token_valid(&self, copilot_config: &CopilotConfig) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        copilot_config.expires_at.saturating_sub(60) > now
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
        use webbrowser;
        webbrowser::open(&device_code.verification_uri)?;
        use arboard::Clipboard;
        let mut clipboard = Clipboard::new()?;
        clipboard.set_text(device_code.user_code.clone())?;

        let dialog_message = format!(
            "User code '{}' has been copied to your clipboard. Please paste it into the GitHub page that will open next.",
            device_code.user_code
        );
        rfd::AsyncMessageDialog::new()
            .set_title("GitHub Device Authorization")
            .set_description(&dialog_message)
            .set_level(rfd::MessageLevel::Info)
            .set_buttons(rfd::MessageButtons::Ok)
            .show()
            .await;

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
