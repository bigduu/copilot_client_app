use copilot::{client::CopilotClinet, config::Config, model::Message};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

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

fn toggle_launchbar(app: &AppHandle) {
    let window = app
        .get_webview_window("spotlight")
        .expect("Did you label your window?");
    if let Ok(true) = window.is_visible() {
        let _ = window.hide();
    } else {
        let _ = window.show();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger for development
    env_logger::init();

    let client = CopilotClinet::new(Config::new());
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            handle.plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts(["ctrl+j", "alt+space"])?
                    .with_handler(|app, shortcut, event| {
                        println!("im here"); // not here
                        if event.state == ShortcutState::Pressed {
                            if shortcut.matches(Modifiers::CONTROL, Code::KeyJ) {
                                println!("Ctrl+j triggered");
                                let _ = app.emit("shortcut-event", "Ctrl+J triggered");
                                toggle_launchbar(app);
                            }
                            if shortcut.matches(Modifiers::ALT, Code::Space) {
                                println!("Alt+Space triggered");
                                let _ = app.emit("shortcut-event", "Alt+Space triggered");
                            }
                        }
                    })
                    .build(),
            )?;
            Ok(())
        })
        .manage(client)
        .invoke_handler(tauri::generate_handler!(execute_prompt))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
