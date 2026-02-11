use std::{path::PathBuf, sync::Arc};

use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use agent_llm::{CopilotClient, CopilotClientTrait};
use agent_server::handlers as agent_handlers;
use agent_server::state::AppState as AgentAppState;
use chat_core::Config;
use log::{error, info};
use tokio::sync::oneshot;

use crate::controllers::anthropic as anthropic_controller;
use crate::controllers::{
    agent_controller, bodhi_controller, claude_install_controller, openai_controller,
    skill_controller, tools_controller, workspace_controller,
};

pub struct AppState {
    pub copilot_client: Arc<dyn CopilotClientTrait>,
    pub app_data_dir: PathBuf,
}

const DEFAULT_WORKER_COUNT: usize = 10;

pub fn app_config(cfg: &mut web::ServiceConfig) {
    // OpenAI and other endpoints under /v1
    cfg.service(
        web::scope("/v1")
            .configure(agent_controller::config)
            .configure(openai_controller::config)
            .configure(bodhi_controller::config)
            .configure(claude_install_controller::config)
            .configure(skill_controller::config)
            .configure(tools_controller::config)
            .configure(workspace_controller::config),
    );

    // Anthropic endpoints under /anthropic/v1 (to match Anthropic SDK expectations)
    cfg.service(
        web::scope("/anthropic/v1").configure(anthropic_controller::config),
    );
}

pub fn agent_api_config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .route("/chat", web::post().to(agent_handlers::chat::handler))
            // New separated execute + events endpoints
            .route(
                "/execute/{session_id}",
                web::post().to(agent_handlers::execute::handler),
            )
            .route(
                "/events/{session_id}",
                web::get().to(agent_handlers::events::handler),
            )
            // Legacy stream endpoint (deprecated)
            .route(
                "/stream/{session_id}",
                web::get().to(agent_handlers::stream::handler),
            )
            .route(
                "/stop/{session_id}",
                web::post().to(agent_handlers::stop::handler),
            )
            .route(
                "/history/{session_id}",
                web::get().to(agent_handlers::history::handler),
            )
            .route(
                "/todo/{session_id}",
                web::get().to(agent_handlers::todo::get_todo_list),
            )
            .route(
                "/todo/{session_id}/exists",
                web::get().to(agent_handlers::todo::has_todo_list),
            )
            .route(
                "/respond/{session_id}",
                web::post().to(agent_handlers::respond::submit_response),
            )
            .route(
                "/respond/{session_id}/pending",
                web::get().to(agent_handlers::respond::get_pending_question),
            )
            .route(
                "/sessions/{session_id}",
                web::delete().to(agent_handlers::delete::handler),
            )
            .route(
                "/metrics/summary",
                web::get().to(agent_handlers::metrics::summary),
            )
            .route(
                "/metrics/by-model",
                web::get().to(agent_handlers::metrics::by_model),
            )
            .route(
                "/metrics/sessions",
                web::get().to(agent_handlers::metrics::sessions),
            )
            .route(
                "/metrics/sessions/{session_id}",
                web::get().to(agent_handlers::metrics::session_detail),
            )
            .route(
                "/metrics/daily",
                web::get().to(agent_handlers::metrics::daily),
            )
            .route("/health", web::get().to(agent_handlers::health::handler))
            // MCP routes
            .service(
                web::scope("/mcp")
                    .route("/servers", web::get().to(agent_handlers::mcp::list_servers))
                    .route("/servers", web::post().to(agent_handlers::mcp::add_server))
                    .route("/servers/{id}", web::get().to(agent_handlers::mcp::get_server))
                    .route("/servers/{id}", web::put().to(agent_handlers::mcp::update_server))
                    .route(
                        "/servers/{id}",
                        web::delete().to(agent_handlers::mcp::delete_server),
                    )
                    .route(
                        "/servers/{id}/connect",
                        web::post().to(agent_handlers::mcp::connect_server),
                    )
                    .route(
                        "/servers/{id}/disconnect",
                        web::post().to(agent_handlers::mcp::disconnect_server),
                    )
                    .route(
                        "/servers/{id}/refresh",
                        web::post().to(agent_handlers::mcp::refresh_tools),
                    )
                    .route(
                        "/servers/{id}/tools",
                        web::get().to(agent_handlers::mcp::get_server_tools),
                    )
                    .route("/tools", web::get().to(agent_handlers::mcp::list_tools)),
            ),
    );
}

async fn build_agent_state(app_data_dir: PathBuf, port: u16) -> AgentAppState {
    let base_url = format!("http://127.0.0.1:{}/v1", port);
    AgentAppState::new_with_config(
        "openai",
        base_url,
        "gpt-4o-mini".to_string(),
        "tauri".to_string(),
        Some(app_data_dir),
        true,
    )
    .await
}

pub async fn run(app_data_dir: PathBuf, port: u16) -> Result<(), String> {
    info!("Starting web service...");

    let config = Config::new();
    let copilot_client: Arc<dyn CopilotClientTrait> =
        Arc::new(CopilotClient::new(config, app_data_dir.clone()));
    let agent_state = web::Data::new(build_agent_state(app_data_dir.clone(), port).await);

    let app_state = web::Data::new(AppState {
        copilot_client,
        app_data_dir,
    });

    let server = HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .app_data(agent_state.clone())
            .wrap(Cors::permissive())
            .configure(app_config)
            .configure(agent_api_config)
    })
    .workers(DEFAULT_WORKER_COUNT)
    .bind(format!("127.0.0.1:{port}"))
    .map_err(|e| format!("Failed to bind server: {e}"))?
    .run();

    info!("Starting web service on http://127.0.0.1:{port}");

    if let Err(e) = server.await {
        error!("Web server error: {}", e);
        return Err(format!("Web server error: {e}"));
    }

    Ok(())
}

pub struct WebService {
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_handle: Option<tokio::task::JoinHandle<()>>,
    app_data_dir: PathBuf,
}

impl WebService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            shutdown_tx: None,
            server_handle: None,
            app_data_dir,
        }
    }

    pub async fn start(&mut self, port: u16) -> Result<(), String> {
        info!("Starting web service...");
        if self.server_handle.is_some() {
            return Err("Web service is already running".to_string());
        }

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

        let config = Config::new();
        let copilot_client: Arc<dyn CopilotClientTrait> =
            Arc::new(CopilotClient::new(config, self.app_data_dir.clone()));
        let agent_state = web::Data::new(build_agent_state(self.app_data_dir.clone(), port).await);

        let app_state = web::Data::new(AppState {
            copilot_client,
            app_data_dir: self.app_data_dir.clone(),
        });

        let server = HttpServer::new(move || {
            App::new()
                .app_data(app_state.clone())
                .app_data(agent_state.clone())
                .wrap(Cors::permissive())
                .configure(app_config)
                .configure(agent_api_config)
        })
        .workers(DEFAULT_WORKER_COUNT)
        .bind(format!("127.0.0.1:{port}"))
        .map_err(|e| format!("Failed to bind server: {e}"))?
        .run();

        let server_handle = tokio::spawn(async move {
            tokio::select! {
                result = server => {
                    if let Err(e) = result {
                        error!("Web server error: {}", e);
                    }
                }
                _ = &mut shutdown_rx => {
                    info!("Web service shutdown signal received");
                }
            }
        });

        self.shutdown_tx = Some(shutdown_tx);
        self.server_handle = Some(server_handle);

        info!("Web service started successfully");
        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            if shutdown_tx.send(()).is_err() {
                error!("Failed to send shutdown signal");
            }
        }

        if let Some(handle) = self.server_handle.take() {
            if let Err(e) = handle.await {
                error!("Error waiting for server shutdown: {}", e);
                return Err(format!("Error waiting for server shutdown: {e}"));
            }
        }

        info!("Web service stopped successfully");
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.server_handle.is_some()
    }
}

impl Drop for WebService {
    fn drop(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }
}
