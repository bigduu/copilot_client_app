use clap::{Parser, Subcommand};
use std::env;
use std::path::PathBuf;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn bodhi_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join(".bodhi")
}

#[derive(Parser, Debug)]
#[command(name = "copilot-server")]
#[command(about = "Copilot Chat Server", long_about = None)]
struct Cli {
    /// Enable headless mode (do not open browser; print user code to stdout)
    #[arg(long)]
    headless: bool,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Start the web server (default)
    Serve {
        /// Port to listen on
        #[arg(short, long, default_value = "8080")]
        port: u16,

        /// Application data directory
        #[arg(short, long)]
        data_dir: Option<PathBuf>,
    },
}

fn env_headless_enabled() -> bool {
    match env::var("COPILOT_CHAT_HEADLESS") {
        Ok(value) => matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "y" | "on"
        ),
        Err(_) => false,
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let cli = Cli::parse();
    if cli.headless || env_headless_enabled() {
        env::set_var("COPILOT_CHAT_HEADLESS", "1");
    }

    match cli.command {
        Some(Commands::Serve { port, data_dir }) => {
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

            // Start the server
            let app_data_dir = data_dir.unwrap_or_else(bodhi_dir);
            if let Err(e) = web_service::server::run(app_data_dir, port).await {
                tracing::error!("Failed to run web service: {}", e);
                std::process::exit(1);
            }
        }
        None => {
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

            let app_data_dir = bodhi_dir();

            // Start the server
            if let Err(e) = web_service::server::run(app_data_dir, port).await {
                tracing::error!("Failed to run web service: {}", e);
                std::process::exit(1);
            }
        }
    }
}
