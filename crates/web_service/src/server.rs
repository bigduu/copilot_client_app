use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use log::{error, info};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;

use crate::controllers::{
    chat_controller, context_controller, openai_controller, system_controller,
    system_prompt_controller, tool_controller,
};
use crate::services::{
    session_manager::ChatSessionManager, system_prompt_service::SystemPromptService,
    tool_service::ToolService,
};
use crate::storage::file_provider::FileStorageProvider;
use copilot_client::{config::Config, CopilotClient, CopilotClientTrait};
use tool_system::{registry::ToolRegistry, ToolExecutor};

pub struct AppState {
    pub session_manager: Arc<ChatSessionManager<FileStorageProvider>>,
    pub copilot_client: Arc<dyn CopilotClientTrait>,
    pub tool_executor: Arc<ToolExecutor>,
    pub system_prompt_service: Arc<SystemPromptService>,
}

pub fn app_config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/v1")
            .configure(openai_controller::config)
            .configure(chat_controller::config)
            .configure(context_controller::config)
            .configure(system_controller::config)
            .configure(system_prompt_controller::config)
            .configure(tool_controller::config),
    );
}

pub async fn run(app_data_dir: PathBuf, port: u16) -> Result<(), String> {
    info!("Starting web service...");

    let tool_registry = Arc::new(Mutex::new(ToolRegistry::new()));
    let tool_executor = Arc::new(ToolExecutor::new(tool_registry.clone()));
    let tool_service = ToolService::new(tool_registry.clone(), tool_executor.clone());
    let tool_service_data = web::Data::new(tool_service);

    let storage_provider = Arc::new(FileStorageProvider::new(app_data_dir.join("conversations")));
    let session_manager = Arc::new(ChatSessionManager::new(storage_provider, 100)); // Cache up to 100 sessions

    let system_prompt_service = Arc::new(SystemPromptService::new(app_data_dir.clone()));
    // Load existing system prompts from storage
    if let Err(e) = system_prompt_service.load_from_storage().await {
        error!("Failed to load system prompts: {}", e);
    }

    let config = Config::new();
    let copilot_client: Arc<dyn CopilotClientTrait> =
        Arc::new(CopilotClient::new(config, app_data_dir.clone()));

    let system_prompt_data = web::Data::from(system_prompt_service.clone());

    let app_state = web::Data::new(AppState {
        session_manager,
        tool_executor,
        copilot_client,
        system_prompt_service,
    });

    let server = HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .app_data(tool_service_data.clone())
            .app_data(system_prompt_data.clone())
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600),
            )
            .configure(app_config)
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

        let tool_registry = Arc::new(Mutex::new(ToolRegistry::new()));
        let tool_executor = Arc::new(ToolExecutor::new(tool_registry.clone()));
        let tool_service = ToolService::new(tool_registry.clone(), tool_executor.clone());
        let tool_service_data = web::Data::new(tool_service);

        let storage_provider = Arc::new(FileStorageProvider::new(
            self.app_data_dir.join("conversations"),
        ));
        let session_manager = Arc::new(ChatSessionManager::new(storage_provider, 100));

        let system_prompt_service = Arc::new(SystemPromptService::new(self.app_data_dir.clone()));
        // Load existing system prompts from storage
        if let Err(e) = system_prompt_service.load_from_storage().await {
            error!("Failed to load system prompts: {}", e);
        }

        let config = Config::new();
        let copilot_client: Arc<dyn CopilotClientTrait> =
            Arc::new(CopilotClient::new(config, self.app_data_dir.clone()));

        let system_prompt_data_for_start = web::Data::from(system_prompt_service.clone());

        let app_state = web::Data::new(AppState {
            session_manager,
            tool_executor,
            copilot_client,
            system_prompt_service,
        });

        let server = HttpServer::new(move || {
            App::new()
                .app_data(app_state.clone())
                .app_data(tool_service_data.clone())
                .app_data(system_prompt_data_for_start.clone())
                .wrap(Logger::default())
                .wrap(
                    Cors::default()
                        .allow_any_origin()
                        .allow_any_method()
                        .allow_any_header()
                        .max_age(3600),
                )
                .configure(app_config)
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

impl Drop for WebService {
    fn drop(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
    }
}
