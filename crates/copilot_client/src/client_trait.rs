use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;
use reqwest::Response;
use tokio::sync::mpsc::Sender;

use crate::api::models::ChatCompletionRequest;
use chat_core::ProxyAuth;

#[async_trait]
pub trait CopilotClientTrait: Send + Sync {
    async fn send_chat_completion_request(
        &self,
        request: ChatCompletionRequest,
    ) -> Result<Response>;

    async fn process_chat_completion_stream(
        &self,
        response: Response,
        tx: Sender<Result<Bytes>>,
    ) -> Result<()>;

    /// Get available models from the Copilot API
    async fn get_models(&self) -> Result<Vec<String>>;

    /// Update proxy auth credentials for runtime requests
    async fn update_proxy_auth(&self, auth: Option<ProxyAuth>) -> Result<()>;
}
