use bytes::Bytes;
use log::{error, info};

use crate::copilot::{model::stream_model::Message, CopilotClient};

#[tauri::command(async)]
pub async fn execute_prompt(
    messages: Vec<Message>,
    state: tauri::State<'_, CopilotClient>,
    channel: tauri::ipc::Channel<String>,
    model: Option<String>,
) -> Result<(), String> {
    info!("=== EXECUTE_PROMPT START ===");
    info!("The latest message: {}", messages.last().unwrap().content);

    let client = state.clone();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<anyhow::Result<Bytes>>(999);

    let tauri_channel_clone = channel.clone();
    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            match message {
                Ok(bytes) => {
                    let result = String::from_utf8_lossy(&bytes);
                    info!("Received message: {result}");
                    tauri_channel_clone.send(result.to_string()).unwrap();
                }
                Err(e) => {
                    error!("Error receiving message: {e}");
                    tauri_channel_clone
                        .send(format!(r#"{{"error": "{e}"}}"#))
                        .unwrap();
                }
            }
        }
    });

    info!("Calling exchange_chat_completion...");
    match client.send_stream_request(messages, tx, model).await {
        Ok(_) => {}
        Err(e) => {
            let error_msg = format!("Error in exchange_chat_completion: {e}");
            error!("{error_msg}");
            channel
                .send(format!(
                    r#"{{"error": "{}"}}"#,
                    error_msg.replace("\"", "\\\"")
                ))
                .unwrap();
        }
    }

    Ok(())
}

#[tauri::command(async)]
pub async fn get_models(state: tauri::State<'_, CopilotClient>) -> Result<Vec<String>, String> {
    let client = state.clone();
    match client.get_models().await {
        Ok(models) => Ok(models),
        Err(e) => Err(format!("Failed to get models: {e}")),
    }
}
