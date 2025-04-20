use copilot::{client::CopilotClinet, config::Config, model::Message};
use tauri::ipc::Channel;

pub mod copilot;

#[tauri::command(async)]
async fn execute_prompt(
    messages: Vec<Message>,
    state: tauri::State<'_, CopilotClinet>,
    channel: Channel<String>,
) -> Result<(), String> {
    println!("=== EXECUTE_PROMPT START ===");
    println!("The latest message: {}", messages.last().unwrap().content);

    let client = state.clone();

    println!("Calling exchange_chat_completion...");
    match client
        .exchange_chat_completion(messages, channel.clone())
        .await
    {
        Ok(_) => {}
        Err(e) => {
            let error_msg = format!("Error in exchange_chat_completion: {}", e);
            println!("{}", error_msg);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger for development
    env_logger::init();

    let client = CopilotClinet::new(Config::new());
    tauri::Builder::default()
        .manage(client)
        .invoke_handler(tauri::generate_handler!(execute_prompt))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
