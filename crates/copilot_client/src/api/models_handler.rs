use anyhow::{anyhow, Error};
use lazy_static::lazy_static;
use log::info;
use reqwest::{Response, StatusCode};
use reqwest_middleware::ClientWithMiddleware;
use std::sync::Arc;
use tokio::sync::Mutex;

// Static variable to store the models
lazy_static! {
    static ref CACHED_MODELS: Mutex<Option<Vec<String>>> = Mutex::new(None);
}

// Struct for handling models logic
#[derive(Debug, Clone)]
pub(crate) struct CopilotModelsHandler {
    client: Arc<ClientWithMiddleware>,
}

impl CopilotModelsHandler {
    pub(crate) fn new(client: Arc<ClientWithMiddleware>) -> Self {
        CopilotModelsHandler { client }
    }

    pub(crate) async fn get_models(&self, chat_token: String) -> anyhow::Result<Vec<String>> {
        let mut cached = CACHED_MODELS.lock().await;
        if let Some(models) = cached.as_ref() {
            info!("Returning cached models");
            return Ok(models.clone());
        }

        let models = self.fetch_models_with_token(chat_token).await?;
        *cached = Some(models.clone());
        Ok(models)
    }

    async fn fetch_models_with_token(&self, access_token: String) -> anyhow::Result<Vec<String>> {
        info!("=== FETCH_MODELS_WITH_TOKEN START ===");
        let url = "https://api.githubcopilot.com/models";
        info!("Fetching available models...");

        // reqwest-retry middleware is already applied to the client
        let response = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await?;

        let status = response.status();
        if status != StatusCode::OK {
            let body = response.text().await.unwrap_or_default();
            let error_msg = format!("Failed to get models: {body} with status {status}");
            log::error!("{error_msg}");
            return Err(anyhow!(error_msg));
        }

        Self::extract_model_from_response(response).await
    }

    async fn extract_model_from_response(response: Response) -> Result<Vec<String>, Error> {
        let models_val: serde_json::Value = response.json().await?;
        info!("Models: {:?}", models_val);

        let data = models_val
            .get("data")
            .and_then(|d| d.as_array())
            .ok_or_else(|| anyhow!("Invalid models response format"))?;

        let model_ids = data
            .iter()
            .filter_map(Self::extract_model_id)
            .collect::<Vec<String>>();

        info!("=== EXTRACT_MODEL_FROM_RESPONSE COMPLETE ===");
        Ok(model_ids)
    }

    fn extract_model_id(model: &serde_json::Value) -> Option<String> {
        let id = model.get("id").and_then(|id| id.as_str())?;
        let model_picker_enabled = model
            .get("model_picker_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if model_picker_enabled {
            Some(id.to_string())
        } else {
            None
        }
    }
}
