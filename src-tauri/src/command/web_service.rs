use log::{error, info};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::copilot::CopilotClient;
use crate::web_service::WebService;

// Global web service state
pub type WebServiceState = Arc<Mutex<WebService>>;

#[tauri::command(async)]
pub async fn start_web_service(
    copilot_client: State<'_, CopilotClient>,
    web_service: State<'_, WebServiceState>,
) -> Result<String, String> {
    info!("Starting web service...");
    
    let mut service = web_service.lock().await;
    let client = Arc::new(copilot_client.inner().clone());
    
    match service.start(client).await {
        Ok(()) => {
            info!("Web service started successfully");
            Ok("Web service started on http://127.0.0.1:8080".to_string())
        }
        Err(e) => {
            error!("Failed to start web service: {}", e);
            Err(e)
        }
    }
}

#[tauri::command(async)]
pub async fn stop_web_service(
    web_service: State<'_, WebServiceState>,
) -> Result<String, String> {
    info!("Stopping web service...");
    
    let mut service = web_service.lock().await;
    
    match service.stop().await {
        Ok(()) => {
            info!("Web service stopped successfully");
            Ok("Web service stopped".to_string())
        }
        Err(e) => {
            error!("Failed to stop web service: {}", e);
            Err(e)
        }
    }
}

#[tauri::command(async)]
pub async fn get_web_service_status(
    web_service: State<'_, WebServiceState>,
) -> Result<bool, String> {
    let service = web_service.lock().await;
    Ok(service.is_running())
}
