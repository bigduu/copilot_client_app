use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use log::{error, info};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::oneshot;

use crate::controllers::{
    chat_controller, context_controller, openai_controller, session_controller, system_controller,
    system_prompt_controller, template_variable_controller, tool_controller,
    user_preference_controller, workflow_controller,
};
use crate::services::{
    approval_manager::ApprovalManager, event_broadcaster::EventBroadcaster,
    session_manager::ChatSessionManager, system_prompt_enhancer::SystemPromptEnhancer,
    system_prompt_service::SystemPromptService, template_variable_service::TemplateVariableService,
    tool_service::ToolService, user_preference_service::UserPreferenceService,
    workflow_service::WorkflowService,
};
use crate::storage::file_provider::FileStorageProvider;
use copilot_client::{config::Config, CopilotClient, CopilotClientTrait};
use session_manager::{FileSessionStorage, MultiUserSessionManager};
use tool_system::{registry::ToolRegistry, ToolExecutor};
use workflow_system::WorkflowRegistry;

pub struct AppState {
    pub session_manager: Arc<ChatSessionManager<FileStorageProvider>>,
    pub copilot_client: Arc<dyn CopilotClientTrait>,
    pub tool_executor: Arc<ToolExecutor>,
    pub system_prompt_service: Arc<SystemPromptService>,
    pub system_prompt_enhancer: Arc<SystemPromptEnhancer>,
    pub template_variable_service: Arc<TemplateVariableService>,
    pub approval_manager: Arc<ApprovalManager>,
    pub user_preference_service: Arc<UserPreferenceService>,
    pub workflow_service: Arc<WorkflowService>,
    pub event_broadcaster: Arc<EventBroadcaster>,
}

const DEFAULT_WORKER_COUNT: usize = 10;

pub fn app_config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/v1")
            .configure(openai_controller::config)
            .configure(chat_controller::config)
            .configure(context_controller::config)
            .configure(session_controller::config)
            .configure(system_controller::config)
            .configure(system_prompt_controller::config)
            .configure(template_variable_controller::config)
            .configure(tool_controller::config)
            .configure(workflow_controller::config)
            .configure(user_preference_controller::config),
    );
}

pub async fn run(app_data_dir: PathBuf, port: u16) -> Result<(), String> {
    info!("Starting web service...");

    let tool_registry = Arc::new(Mutex::new(ToolRegistry::new()));
    let tool_executor = Arc::new(ToolExecutor::new(tool_registry.clone()));
    let tool_service = ToolService::new(tool_registry.clone(), tool_executor.clone());
    let tool_service_data = web::Data::new(tool_service);

    // Initialize workflow system
    let workflow_registry = Arc::new(WorkflowRegistry::new());
    let workflow_service = Arc::new(WorkflowService::new(workflow_registry));
    let workflow_service_data = web::Data::from(workflow_service.clone());

    let storage_provider = Arc::new(FileStorageProvider::new(app_data_dir.join("conversations")));
    let session_manager = Arc::new(ChatSessionManager::new(storage_provider, 100)); // Cache up to 100 sessions

    let system_prompt_service = Arc::new(SystemPromptService::new(app_data_dir.clone()));
    // Load existing system prompts from storage
    if let Err(e) = system_prompt_service.load_from_storage().await {
        error!("Failed to load system prompts: {}", e);
    }

    // Initialize template variable service
    let template_variable_service = Arc::new(TemplateVariableService::new(app_data_dir.clone()));
    // Load template variables from storage
    if let Err(e) = template_variable_service.load_from_storage().await {
        error!("Failed to load template variables: {}", e);
    }

    let user_preference_service = Arc::new(UserPreferenceService::new(app_data_dir.clone()));
    if let Err(e) = user_preference_service.load_from_storage().await {
        error!("Failed to load user preferences: {}", e);
    }

    let config = Config::new();
    let copilot_client: Arc<dyn CopilotClientTrait> =
        Arc::new(CopilotClient::new(config, app_data_dir.clone()));

    // Create system prompt enhancer with template service
    let tool_registry_arc = Arc::new(ToolRegistry::new());
    let system_prompt_enhancer = Arc::new(
        SystemPromptEnhancer::with_default_config(tool_registry_arc)
            .with_template_service(template_variable_service.clone()),
    );

    let approval_manager = Arc::new(ApprovalManager::new());

    // Initialize user session manager (new backend session manager)
    let session_storage = FileSessionStorage::new(app_data_dir.join("sessions"));
    let user_session_manager = MultiUserSessionManager::new(session_storage);
    let user_session_manager_data = web::Data::new(user_session_manager);

    let system_prompt_data = web::Data::from(system_prompt_service.clone());
    let enhancer_data = web::Data::from(system_prompt_enhancer.clone());
    let template_variable_data = web::Data::from(template_variable_service.clone());

    // Create event broadcaster for Signal-Pull SSE
    let event_broadcaster = Arc::new(EventBroadcaster::new());

    let app_state = web::Data::new(AppState {
        session_manager,
        tool_executor,
        copilot_client,
        system_prompt_service,
        system_prompt_enhancer,
        template_variable_service: template_variable_service.clone(),
        approval_manager: approval_manager.clone(),
        user_preference_service: user_preference_service.clone(),
        workflow_service: workflow_service.clone(),
        event_broadcaster,
    });

    let server = HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .app_data(tool_service_data.clone())
            .app_data(system_prompt_data.clone())
            .app_data(enhancer_data.clone())
            .app_data(template_variable_data.clone())
            .app_data(workflow_service_data.clone())
            .app_data(user_session_manager_data.clone())
            // CORS only - no middleware for testing
            .wrap(Cors::permissive())
            .configure(app_config)
    })
    .workers(DEFAULT_WORKER_COUNT)
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

        // Initialize workflow system
        let workflow_registry = Arc::new(WorkflowRegistry::new());
        let workflow_service = Arc::new(WorkflowService::new(workflow_registry));
        let workflow_service_data = web::Data::from(workflow_service.clone());

        let storage_provider = Arc::new(FileStorageProvider::new(
            self.app_data_dir.join("conversations"),
        ));
        let session_manager = Arc::new(ChatSessionManager::new(storage_provider, 100));

        let system_prompt_service = Arc::new(SystemPromptService::new(self.app_data_dir.clone()));
        // Load existing system prompts from storage
        if let Err(e) = system_prompt_service.load_from_storage().await {
            error!("Failed to load system prompts: {}", e);
        }

        // Initialize template variable service
        let template_variable_service =
            Arc::new(TemplateVariableService::new(self.app_data_dir.clone()));
        // Load template variables from storage
        if let Err(e) = template_variable_service.load_from_storage().await {
            error!("Failed to load template variables: {}", e);
        }

        let user_preference_service =
            Arc::new(UserPreferenceService::new(self.app_data_dir.clone()));
        if let Err(e) = user_preference_service.load_from_storage().await {
            error!("Failed to load user preferences: {}", e);
        }

        let config = Config::new();
        let copilot_client: Arc<dyn CopilotClientTrait> =
            Arc::new(CopilotClient::new(config, self.app_data_dir.clone()));

        // Create system prompt enhancer with template service
        let tool_registry_arc = Arc::new(ToolRegistry::new());
        let system_prompt_enhancer = Arc::new(
            SystemPromptEnhancer::with_default_config(tool_registry_arc)
                .with_template_service(template_variable_service.clone()),
        );

        let approval_manager = Arc::new(ApprovalManager::new());

        let system_prompt_data_for_start = web::Data::from(system_prompt_service.clone());
        let enhancer_data_for_start = web::Data::from(system_prompt_enhancer.clone());
        let template_variable_data_for_start = web::Data::from(template_variable_service.clone());

        // Create event broadcaster for Signal-Pull SSE
        let event_broadcaster = Arc::new(EventBroadcaster::new());

        let app_state = web::Data::new(AppState {
            session_manager,
            tool_executor,
            copilot_client,
            system_prompt_service,
            system_prompt_enhancer,
            template_variable_service: template_variable_service.clone(),
            approval_manager: approval_manager.clone(),
            user_preference_service: user_preference_service.clone(),
            workflow_service: workflow_service.clone(),
            event_broadcaster,
        });

        let server = HttpServer::new(move || {
            App::new()
                .app_data(app_state.clone())
                .app_data(tool_service_data.clone())
                .app_data(system_prompt_data_for_start.clone())
                .app_data(enhancer_data_for_start.clone())
                .app_data(template_variable_data_for_start.clone())
                .app_data(workflow_service_data.clone())
                // CORS must be first (wraps last, executes first on response)
                .wrap(Cors::permissive())
                .wrap(Logger::default())
                // Temporarily disable TracingMiddleware to test
                // .wrap(TracingMiddleware)
                .configure(app_config)
        })
        .workers(DEFAULT_WORKER_COUNT)
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
