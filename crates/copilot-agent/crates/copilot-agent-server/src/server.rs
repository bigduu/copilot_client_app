use actix_web::{web, App, HttpServer};
use std::io;

use crate::handlers;
use crate::state::AppState;

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
    log::info!("Initializing server with provider: {}, base URL: {}", provider, llm_base_url);
    let state = web::Data::new(AppState::new_with_config(provider, llm_base_url, model, api_key).await);

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
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
