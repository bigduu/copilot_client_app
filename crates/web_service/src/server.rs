use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use log::{error, info};
use std::sync::Arc;
use tokio::sync::oneshot;

use crate::controllers::{chat_controller, system_controller, tool_controller};
use crate::services::tool_service::ToolService;
use copilot_client::api::client::CopilotClient;
use tool_system::{create_tools_manager, manager::ToolsManager};

use copilot_client::config::Config;
use std::path::PathBuf;

pub async fn run(app_data: PathBuf, port: u16) -> Result<(), String> {
    info!("Starting web service...");

    let config = Config::default();
    let app_data_dir = app_data;
    let copilot_client = Arc::new(CopilotClient::new(config, app_data_dir));
    let tools_manager = Arc::new(create_tools_manager());
    let tool_service = ToolService::new(tools_manager.clone());

    let copilot_client_data = web::Data::new(copilot_client);
    let tool_service_data = web::Data::new(tool_service);

    let server = HttpServer::new(move || {
        App::new()
            .app_data(copilot_client_data.clone())
            .app_data(tool_service_data.clone())
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600),
            )
            .configure(tool_controller::config)
            .configure(system_controller::config)
            .service(web::scope("/v1").configure(chat_controller::config))
    })
    .bind(format!("127.0.0.1:{}", port))
    .map_err(|e| format!("Failed to bind server: {}", e))?
    .run();

    info!("Starting web service on http://127.0.0.1:{}", port);

    if let Err(e) = server.await {
        error!("Web server error: {}", e);
        return Err(format!("Web server error: {}", e));
    }

    Ok(())
}

pub struct WebService {
    shutdown_tx: Option<oneshot::Sender<()>>,
    server_handle: Option<tokio::task::JoinHandle<()>>,
    tools_manager: Arc<ToolsManager>,
}

impl WebService {
    pub fn new() -> Self {
        Self {
            shutdown_tx: None,
            server_handle: None,
            tools_manager: Arc::new(create_tools_manager()),
        }
    }

    pub async fn start(&mut self, copilot_client: Arc<CopilotClient>, port: u16) -> Result<(), String> {
        info!("Starting web service...");
        if self.server_handle.is_some() {
            return Err("Web service is already running".to_string());
        }

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

        let copilot_client_data = web::Data::new(copilot_client);
        let tool_service = ToolService::new(self.tools_manager.clone());
        let tool_service_data = web::Data::new(tool_service);

        let server = HttpServer::new(move || {
            App::new()
                .app_data(copilot_client_data.clone())
                .app_data(tool_service_data.clone())
                .wrap(Logger::default())
                .wrap(
                    Cors::default()
                        .allow_any_origin()
                        .allow_any_method()
                        .allow_any_header()
                        .max_age(3600),
                )
                .configure(tool_controller::config)
                .configure(system_controller::config)
                .service(web::scope("/v1").configure(chat_controller::config))
        })
        .bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("Failed to bind server: {}", e))?
        .run();

        info!("Starting web service on http://127.0.0.1:{}", port);

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
                return Err(format!("Error waiting for server shutdown: {}", e));
            }
        }

        info!("Web service stopped successfully");
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.server_handle.is_some()
    }
}

impl Default for WebService {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for WebService {
    fn drop(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }
}
