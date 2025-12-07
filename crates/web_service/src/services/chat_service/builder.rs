//! ChatService Builder Pattern
//!
//! Provides a fluent API for constructing ChatService instances with proper dependency injection.

use crate::{
    error::AppError,
    services::{
        approval_manager::ApprovalManager, workflow_service::WorkflowService, AgentService,
    },
    storage::StorageProvider,
};
use copilot_client::CopilotClientTrait;
use std::sync::Arc;
use tool_system::ToolExecutor;
use uuid::Uuid;

use super::super::{
    session_manager::ChatSessionManager, system_prompt_service::SystemPromptService,
};
use super::{ChatService, MessageHandler, StreamHandler, ToolHandler, WorkflowHandler};

/// Builder for ChatService with fluent API
///
/// # Example
/// ```ignore
/// let service = ChatServiceBuilder::new(session_manager, conversation_id)
///     .with_copilot_client(client)
///     .with_tool_executor(executor)
///     .with_system_prompt_service(prompt_service)
///     .with_approval_manager(approval)
///     .with_workflow_service(workflows)
///     .build()?;
/// ```
pub struct ChatServiceBuilder<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Option<Arc<dyn CopilotClientTrait>>,
    tool_executor: Option<Arc<ToolExecutor>>,
    system_prompt_service: Option<Arc<SystemPromptService>>,
    approval_manager: Option<Arc<ApprovalManager>>,
    workflow_service: Option<Arc<WorkflowService>>,
    event_broadcaster: Option<Arc<crate::services::EventBroadcaster>>,
}

impl<T: StorageProvider + 'static> ChatServiceBuilder<T> {
    pub(super) fn new(session_manager: Arc<ChatSessionManager<T>>, conversation_id: Uuid) -> Self {
        Self {
            session_manager,
            conversation_id,
            copilot_client: None,
            tool_executor: None,
            system_prompt_service: None,
            approval_manager: None,
            workflow_service: None,
            event_broadcaster: None,
        }
    }

    /// Set the Copilot client for LLM interactions
    pub fn with_copilot_client(mut self, client: Arc<dyn CopilotClientTrait>) -> Self {
        self.copilot_client = Some(client);
        self
    }

    /// Set the tool executor for tool execution
    pub fn with_tool_executor(mut self, executor: Arc<ToolExecutor>) -> Self {
        self.tool_executor = Some(executor);
        self
    }

    /// Set the system prompt service
    pub fn with_system_prompt_service(mut self, service: Arc<SystemPromptService>) -> Self {
        self.system_prompt_service = Some(service);
        self
    }

    /// Set the approval manager for tool approvals
    pub fn with_approval_manager(mut self, manager: Arc<ApprovalManager>) -> Self {
        self.approval_manager = Some(manager);
        self
    }

    /// Set the workflow service
    pub fn with_workflow_service(mut self, service: Arc<WorkflowService>) -> Self {
        self.workflow_service = Some(service);
        self
    }

    /// Set the event broadcaster for SSE events
    pub fn with_event_broadcaster(
        mut self,
        broadcaster: Arc<crate::services::EventBroadcaster>,
    ) -> Self {
        self.event_broadcaster = Some(broadcaster);
        self
    }

    /// Build the ChatService instance
    ///
    /// # Errors
    /// Returns an error if required dependencies are missing
    pub fn build(self) -> Result<ChatService<T>, AppError> {
        // Validate required dependencies
        let copilot_client = self
            .copilot_client
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("CopilotClient is required")))?;

        let tool_executor = self
            .tool_executor
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("ToolExecutor is required")))?;

        let system_prompt_service = self.system_prompt_service.ok_or_else(|| {
            AppError::InternalError(anyhow::anyhow!("SystemPromptService is required"))
        })?;

        let approval_manager = self.approval_manager.ok_or_else(|| {
            AppError::InternalError(anyhow::anyhow!("ApprovalManager is required"))
        })?;

        let workflow_service = self.workflow_service.ok_or_else(|| {
            AppError::InternalError(anyhow::anyhow!("WorkflowService is required"))
        })?;

        let agent_service = Arc::new(AgentService::with_default_config());

        // Initialize message handlers
        let file_reference_handler = crate::services::message_processing::FileReferenceHandler::new(
            tool_executor.clone(),
            self.session_manager.clone(),
        );
        let workflow_handler = crate::services::message_processing::WorkflowHandler::new(
            workflow_service.clone(),
            self.session_manager.clone(),
        );
        let tool_result_handler = crate::services::message_processing::ToolResultHandler::new(
            self.session_manager.clone(),
        );
        let text_message_handler = crate::services::message_processing::TextMessageHandler::new(
            self.session_manager.clone(),
        );

        // Initialize AgentLoopHandler (used by all Handlers)
        let agent_loop_handler = Arc::new(tokio::sync::RwLock::new(
            crate::services::agent_loop_handler::AgentLoopHandler::new(
                self.session_manager.clone(),
                copilot_client.clone(),
                system_prompt_service.clone(),
                self.event_broadcaster.clone(),
                tool_executor.clone(),
                approval_manager.clone(),
                agent_service.clone(),
                file_reference_handler,
                workflow_handler,
                tool_result_handler,
                text_message_handler,
            ),
        ));

        // Create domain-specific Handlers
        let message_handler = MessageHandler::new(agent_loop_handler.clone());
        let tool_handler = ToolHandler::new(agent_loop_handler.clone());
        let workflow_handler_domain = WorkflowHandler::new(agent_loop_handler.clone());
        let stream_handler = StreamHandler::new(agent_loop_handler);

        Ok(ChatService {
            conversation_id: self.conversation_id,
            message_handler,
            tool_handler,
            workflow_handler: workflow_handler_domain,
            stream_handler,
        })
    }
}
