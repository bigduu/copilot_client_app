use log::{debug, error, info};

use crate::copilot::{model::stream_model::Message, CopilotClient};

#[tauri::command(async)]
pub async fn execute_prompt(
    messages: Vec<Message>, // 前端已预处理的消息
    model: Option<String>,
    state: tauri::State<'_, CopilotClient>,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== EXECUTE_PROMPT START ===");
    info!(
        "The system message: {}",
        messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect::<Vec<String>>()
            .join("\n")
    );
    info!("The latest message: {}", messages.last().unwrap().content);

    // 纯粹的LLM流式请求
    let client = state.clone();
    let (mut rx, handle) = client.send_stream_request(messages, model).await;

    let tauri_channel_clone = channel.clone();

    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            match message {
                Ok(bytes) => {
                    let result = String::from_utf8_lossy(&bytes);
                    debug!("Received message: {result}");
                    let _ = tauri_channel_clone.send(result.to_string());
                }
                Err(e) => {
                    error!("Error receiving message: {e}");
                    let error_msg = format!(r#"{{"error": "{}"}}"#, e);
                    let _ = tauri_channel_clone.send(error_msg);
                }
            }
        }
    });

    let _ = handle.await.unwrap();

    info!("Chat completion finished");
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
