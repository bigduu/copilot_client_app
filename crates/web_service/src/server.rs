use actix_cors::Cors;
use actix_web::{web, App, HttpServer};
use log::{error, info};
use std::{path::PathBuf, sync::Arc};
use tokio::sync::oneshot;

use crate::controllers::{anthropic_controller, openai_controller};
use copilot_client::{config::Config, CopilotClient, CopilotClientTrait};

pub struct AppState {
    pub copilot_client: Arc<dyn CopilotClientTrait>,
}

const DEFAULT_WORKER_COUNT: usize = 10;

pub fn app_config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/v1")
            .configure(anthropic_controller::config)
            .configure(openai_controller::config),
    );
}

pub async fn run(app_data_dir: PathBuf, port: u16) -> Result<(), String> {
    info!("Starting web service...");

    let config = Config::new();
    let copilot_client: Arc<dyn CopilotClientTrait> = Arc::new(CopilotClient::new(config, app_data_dir));
    let app_state = web::Data::new(AppState { copilot_client });

    let server = HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(Cors::permissive())
            .configure(app_config)
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
        let app_state = web::Data::new(AppState { copilot_client });

        let server = HttpServer::new(move || {
            App::new()
                .app_data(app_state.clone())
                .wrap(Cors::permissive())
                .configure(app_config)
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

