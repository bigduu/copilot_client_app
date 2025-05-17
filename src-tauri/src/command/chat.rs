use log::{debug, error, info};

use crate::{
    copilot::{model::stream_model::Message, CopilotClient},
    processor::ProcessorManager,
};

#[tauri::command(async)]
pub async fn execute_prompt(
    messages: Vec<Message>,
    model: Option<String>,
    state: tauri::State<'_, CopilotClient>,
    processor_manager: tauri::State<'_, ProcessorManager>,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== EXECUTE_PROMPT START ===");
    info!("The latest message: {}", messages.last().unwrap().content);
    let messages = processor_manager.process(messages).await;
    let client = state.clone();
    let (mut rx, handle) = client.send_stream_request(messages, model).await;

    let tauri_channel_clone = channel.clone();
    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            match message {
                Ok(bytes) => {
                    let result = String::from_utf8_lossy(&bytes);
                    debug!("Received message: {result}");
                    tauri_channel_clone.send(result.to_string()).unwrap();
                }
                Err(e) => {
                    error!("Error receiving message: {e}");
                    tauri_channel_clone
                        .send(format!(r#"{{\"error\": "{e}"}}"#))
                        .unwrap();
                }
            }
        }
    });

    let _ = handle.await.unwrap();

    info!("Calling exchange_chat_completion...");
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
