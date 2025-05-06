use arboard::Clipboard;
use copilot::{client::CopilotClinet, config::Config, model::Message};
use tauri::{ipc::Channel, AppHandle, Emitter, Listener, Manager, State, WindowEvent};
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

#[tauri::command]
async fn forward_message_to_main(app_handle: AppHandle, message: String) -> Result<(), String> {
    let main_window = app_handle
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Just emit the event directly to the main window
    main_window
        .emit("new-chat-message", Some(message))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

fn toggle_launchbar(app: &AppHandle) {
    let window = app
        .get_webview_window("spotlight")
        .expect("Did you label your window?");

    if let Ok(true) = window.is_visible() {
        let _ = window.hide();
    } else {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.center();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger for development
    env_logger::init();

    let client = CopilotClinet::new(Config::new());

    let main_window_label = "main";
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            // Listen for create-chat event
            let main_window = app.get_webview_window(main_window_label).unwrap();
            let client_state = app.state::<CopilotClinet>();

            // The global shortcut handler remains
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
        .invoke_handler(tauri::generate_handler![
            execute_prompt,
            forward_message_to_main,
            copy_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
