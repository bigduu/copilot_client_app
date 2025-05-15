use anyhow::{anyhow, Error};
use lazy_static::lazy_static;
use log::info;
use reqwest::{Client, Response};
use std::sync::Arc;
use tokio::sync::Mutex;

// Static variable to store the models
lazy_static! {
    static ref CACHED_MODELS: Mutex<Option<Vec<String>>> = Mutex::new(None);
}

// Struct for handling models logic
#[derive(Debug)]
pub(crate) struct CopilotModelsHandler {
    client: Arc<Client>,
}

impl CopilotModelsHandler {
    pub(crate) fn new(client: Arc<Client>) -> Self {
        CopilotModelsHandler { client }
    }

    pub(crate) async fn get_models(&self, chat_token: String) -> anyhow::Result<Vec<String>> {
        let mut cached = CACHED_MODELS.lock().await;
        if let Some(models) = cached.as_ref() {
            info!("Returning cached models");
            Ok(models.clone())
        } else {
            let models = self.fetch_models_with_token(chat_token).await?;
            *cached = Some(models.clone());
            Ok(models)
        }
    }

    async fn fetch_models_with_token(&self, access_token: String) -> anyhow::Result<Vec<String>> {
        info!("=== FETCH_MODELS_WITH_TOKEN START ===");
        let start_time = std::time::Instant::now();

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
                log::error!("{error_msg}");
                return Err(anyhow!(error_msg));
            }
        };

        match response.status() {
            reqwest::StatusCode::OK => Self::extract_model_from_response(response).await,
            s => {
                let body = response.text().await.unwrap_or_default();
                let error_msg = format!("Failed to get models: {body} with status {s}");
                log::error!("{error_msg}");
                Err(anyhow!(error_msg))
            }
        }
    }

    async fn extract_model_from_response(response: Response) -> Result<Vec<String>, Error> {
        let models_val: serde_json::Value = response.json().await?;
        info!("Models: {:?}", models_val);

        let model_ids = if let Some(data) = models_val.get("data").and_then(|d| d.as_array()) {
            data.iter()
                .filter_map(|model| {
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
                })
                .collect::<Vec<String>>()
        } else {
            return Err(anyhow!("Invalid models response format"));
        };

        info!("=== EXTRACT_MODEL_FROM_RESPONSE COMPLETE ===");
        Ok(model_ids)
    }
}
