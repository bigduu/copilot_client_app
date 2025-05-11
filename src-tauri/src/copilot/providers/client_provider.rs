use async_trait::async_trait;
use llm_proxy_core::{ClientProvider, Error};
use tauri::http::HeaderMap;

pub struct CopilotClientProvider {
    client: reqwest::Client,
}

impl Default for CopilotClientProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CopilotClientProvider {
    pub fn new() -> Self {
        let msg = "Failed to parse header";
        let mut headers = HeaderMap::new();
        headers.insert("Editor-Version", "vscode/1.99.2".parse().expect(msg));
        headers.insert(
            "Editor-Plugin-Version",
            "copilot-chat/0.20.3".parse().expect(msg),
        );
        headers.insert("User-Agent", "GitHubCopilot/1.155.0".parse().expect(msg));
        headers.insert("Content-Type", "application/json".parse().expect(msg));
        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to create reqwest client");
        Self { client }
    }
}

#[async_trait]
impl ClientProvider for CopilotClientProvider {
    async fn get_client(&self) -> Result<reqwest::Client, Error> {
        Ok(self.client.clone())
    }
}
