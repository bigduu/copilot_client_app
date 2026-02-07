use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use std::io;
use std::path::PathBuf;
use std::thread;

use crate::handlers;
use crate::state::AppState;

#[allow(dead_code)]
pub async fn run_server(port: u16) -> io::Result<()> {
    run_server_with_config(
        port,
        "openai",
        "http://localhost:12123".to_string(),
        "kimi-for-coding".to_string(),
        "sk-test".to_string(),
    ).await
}

pub async fn run_server_with_config(
    port: u16,
    provider: &str,
    llm_base_url: String,
    model: String,
    api_key: String,
) -> io::Result<()> {
    run_server_with_config_and_mode(
        port,
        provider,
        llm_base_url,
        model,
        api_key,
        None,
        false,
    ).await
}

pub async fn run_server_with_config_and_mode(
    port: u16,
    provider: &str,
    llm_base_url: String,
    model: String,
    api_key: String,
    app_data_dir: Option<PathBuf>,
    tauri_mode: bool,
) -> io::Result<()> {
    log::info!("Initializing server with provider: {}, base URL: {}", provider, llm_base_url);
    let state = web::Data::new(
        AppState::new_with_config(
            provider,
            llm_base_url,
            model,
            api_key,
            app_data_dir,
            tauri_mode,
        )
        .await,
    );

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Cors::permissive())
            .service(
                web::scope("/api/v1")
                    .route("/chat", web::post().to(handlers::chat::handler))
                    .route("/stream/{session_id}", web::get().to(handlers::stream::handler))
                    .route("/stop/{session_id}", web::post().to(handlers::stop::handler))
                    .route("/history/{session_id}", web::get().to(handlers::history::handler))
                    .route("/health", web::get().to(handlers::health::handler))
            )
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}

#[allow(dead_code)]
pub fn start_server_in_thread(
    port: u16,
    provider: &str,
    llm_base_url: String,
    model: String,
    api_key: String,
    app_data_dir: Option<PathBuf>,
    tauri_mode: bool,
) -> thread::JoinHandle<()> {
    let provider = provider.to_string();
    thread::spawn(move || {
        let system = actix_web::rt::System::new();
        let result = system.block_on(run_server_with_config_and_mode(
            port,
            &provider,
            llm_base_url,
            model,
            api_key,
            app_data_dir,
            tauri_mode,
        ));
        if let Err(err) = result {
            log::error!("Agent server exited with error: {}", err);
        }
    })
}
