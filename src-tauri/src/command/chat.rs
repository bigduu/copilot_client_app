use log::{debug, error, info};

use crate::copilot::{model::stream_model::Message, CopilotClient};

async fn send_direct_llm_request(
    messages: Vec<Message>,
    model: Option<String>,
    copilot_client: &CopilotClient,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== SENDING DIRECT LLM REQUEST ===");

    let (mut rx, handle) = copilot_client.send_stream_request(messages, model).await;

    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            match message {
                Ok(bytes) => {
                    let result = String::from_utf8_lossy(&bytes);
                    debug!("Direct LLM response: {result}");
                    let _ = channel.send(result.to_string());
                }
                Err(e) => {
                    error!("Error in direct LLM response: {e}");
                    let _ = channel.send(format!(r#"{{\"error\": "{e}"}}"#));
                }
            }
        }
    });

    let _ = handle.await.unwrap();
    Ok(())
}

#[tauri::command(async)]
pub async fn execute_prompt(
    messages: Vec<Message>,
    model: Option<String>,
    copilot_client: tauri::State<'_, CopilotClient>,
    channel: tauri::ipc::Channel<String>,
) -> Result<(), String> {
    info!("=== EXECUTE_PROMPT START ===");

    if let Some(last_msg) = messages.last() {
        info!("Latest message: {}", last_msg.content);
    }

    // Send directly to LLM
    send_direct_llm_request(messages, model, &copilot_client, channel).await
}

#[tauri::command(async)]
pub async fn get_models(state: tauri::State<'_, CopilotClient>) -> Result<Vec<String>, String> {
    let client = state.clone();
    match client.get_models().await {
        Ok(models) => Ok(models),
        Err(e) => Err(format!("Failed to get models: {e}")),
    }
}
