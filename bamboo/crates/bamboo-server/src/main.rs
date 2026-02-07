use std::io;
use clap::Parser;

mod handlers;
mod server;
mod state;
mod agent_runner;
mod logging;
mod skill_loader;

use server::run_server_with_config;
use logging::init_logging;

#[derive(Parser, Debug, Clone)]
#[command(name = "bamboo-server")]
#[command(about = "Bamboo HTTP Server")]
#[command(version)]
struct Cli {
    /// Enable debug mode
    #[arg(long, env = "DEBUG", default_value = "false")]
    debug: bool,
    
    /// Server port
    #[arg(long, env = "PORT", default_value = "8081")]
    port: u16,
    
    /// LLM provider (openai or copilot)
    #[arg(long, env = "LLM_PROVIDER", default_value = "openai")]
    provider: ProviderType,
    
    /// LLM API base URL
    #[arg(long, env = "LLM_BASE_URL", default_value = "http://localhost:12123")]
    llm_base_url: String,
    
    /// LLM model name
    #[arg(long, env = "LLM_MODEL", default_value = "kimi-for-coding")]
    model: String,
    
    /// LLM API key
    #[arg(long, env = "LLM_API_KEY", default_value = "sk-test")]
    api_key: String,
    
    /// Log level (overrides debug flag)
    #[arg(long, env = "RUST_LOG")]
    log_level: Option<String>,
}

#[derive(Debug, Clone, Copy, clap::ValueEnum)]
enum ProviderType {
    OpenAI,
    Copilot,
}

#[actix_web::main]
async fn main() -> io::Result<()> {
    let cli = Cli::parse();
    
    // 初始化日志
    if cli.log_level.is_some() {
        // 如果设置了 RUST_LOG，使用它
        env_logger::init();
    } else {
        init_logging(cli.debug);
    }
    
    log::info!("Starting Bamboo Server on port {}", cli.port);
    log::info!("LLM Configuration:");
    log::info!("  Provider: {:?}", cli.provider);
    log::info!("  Base URL: {}", cli.llm_base_url);
    log::info!("  Model: {}", cli.model);
    
    if cli.debug {
        log::debug!("Debug mode enabled");
        log::debug!("Server configuration:");
        log::debug!("  Port: {}", cli.port);
        log::debug!("  Provider: {:?}", cli.provider);
        log::debug!("  LLM Base URL: {}", cli.llm_base_url);
        log::debug!("  LLM Model: {}", cli.model);
        log::debug!("  Debug: true");
    }
    
    let provider = match cli.provider {
        ProviderType::OpenAI => "openai",
        ProviderType::Copilot => "copilot",
    };
    
    run_server_with_config(
        cli.port,
        provider,
        cli.llm_base_url,
        cli.model,
        cli.api_key,
    ).await
}
