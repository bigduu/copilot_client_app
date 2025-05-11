use arboard::Clipboard;
use copilot::o_client::CopilotClinet;
use copilot::{config::Config, pipeline};
use llm_proxy_core::Pipeline;
use llm_proxy_openai::{ChatCompletionRequest, Message};
use serde_json::json;
use tauri::{ipc::Channel, AppHandle, Emitter, Manager};

pub mod copilot;

#[tauri::command]
async fn execute_prompt_stream(
    messages: Vec<Message>,
    state: tauri::State<'_, Pipeline<ChatCompletionRequest>>,
    channel: Channel<String>,
    model: Option<String>,
) -> Result<(), String> {
    let model = model.unwrap_or("gpt-4o".into());
    let request = ChatCompletionRequest::new_stream(model, messages);
    let pipe = state.clone();
    let json =
        serde_json::to_vec(&request).map_err(|e| format!("Failed to serialize request: {e}"))?;
    match pipe.execute(bytes::Bytes::copy_from_slice(&json)).await {
        Ok(rev) => {
            let emitter = channel.clone();
            let mut stream = rev;
            while let Some(chunk) = stream.recv().await {
                match chunk {
                    Ok(data) => {
                        let data = String::from_utf8_lossy(&data);
                        println!("Received chunk: {data}");
                        emitter.send(data.to_string()).unwrap();
                    }
                    Err(e) => {
                        let error_msg = format!("Error: {e}");
                        println!("{error_msg}");
                        emitter
                            .send(format!(
                                r#"{{"error": "{}"}}"#,
                                error_msg.replace("\"", "\\\"")
                            ))
                            .unwrap();
                    }
                }
            }
        }
        Err(e) => {
            let error_msg = format!("Error in exchange_chat_completion: {e}");
            println!("{error_msg}");
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

#[tauri::command]
async fn forward_message_to_main(app_handle: AppHandle, message: String) -> Result<(), String> {
    println!("[forward_message_to_main] called with message: {message}");
    let main_window = app_handle
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Emit event with object payload
    let emit_result = main_window.emit("new-chat-message", Some(json!({ "message": message })));
    println! {
        "[forward_message_to_main] emit result: {emit_result:?}, message: {message}"
    };
    emit_result.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
async fn get_models(state: tauri::State<'_, CopilotClinet>) -> Result<Vec<String>, String> {
    let client = state.clone();
    match client.get_models().await {
        Ok(models) => Ok(models),
        Err(e) => Err(format!("Failed to get models: {e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger for development
    env_logger::init();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            let app_data_dir = handle.path().app_data_dir().unwrap();
            let pipe = pipeline::create_pipeline(app_data_dir.clone());
            app.manage(pipe);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_prompt_stream,
            forward_message_to_main,
            copy_to_clipboard,
            get_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
