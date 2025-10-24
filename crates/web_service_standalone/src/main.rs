use std::env;
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    // Initialize the logger
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("Starting standalone web service...");

    // Get port from environment variable or use default
    let port = env::var("APP_PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(8080);

    // Start the server
    // Note: The user requested to call `start_server`, but the available and correct
    // function in the `web_service` crate for a standalone service is `run`.
    let app_data_dir = PathBuf::from(".");
    if let Err(e) = web_service::server::run(app_data_dir, port).await {
        log::error!("Failed to run web service: {}", e);
        std::process::exit(1);
    }
}
