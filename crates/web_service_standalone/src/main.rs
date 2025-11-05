use std::env;
use std::path::PathBuf;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // Initialize tracing subscriber with DEBUG level by default for standalone mode
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug")))
        .with(
            fmt::layer()
                .with_target(true)
                .with_thread_ids(false)
                .with_line_number(true)
                .with_file(false),
        )
        .init();

    tracing::info!("Starting standalone web service...");

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
        tracing::error!("Failed to run web service: {}", e);
        std::process::exit(1);
    }
}
