//! Agent Loop Handler - Coordinator Pattern
//!
//! This module implements a coordinator pattern for the agent loop lifecycle.
//! The main `AgentLoopHandler` struct serves as a unified entry point that
//! orchestrates different phases of message processing through specialized modules.
//!
//! ## Architecture
//!
//! ```text
//! AgentLoopHandler (Coordinator)
//!     ├─> Initialization Phase   (context loading, prompt setup)
//!     ├─> Message Intake Phase   (payload handling, delegation)
//!     ├─> LLM Request Phase      (non-streaming requests)
//!     ├─> LLM Streaming Phase    (SSE streaming responses)
//!     ├─> Approval Flow Phase    (tool approval, resumption)
//!     └─> Error Handling Phase   (LLM errors, notifications)
//! ```
//!
//! ## Public Interface
//!
//! - `process_message()` - Non-streaming message processing
//! - `process_message_stream()` - SSE streaming message processing  
//! - `continue_agent_loop_after_approval()` - Resume after tool approval
//! - `approve_tool_calls()` - Legacy approval method

use crate::{
    error::AppError,
    models::{SendMessageRequest, ServiceResponse},
    services::{
        agent_loop_runner::AgentLoopRunner, message_builder,
        message_processing::{
            FileReferenceHandler, TextMessageHandler, ToolResultHandler, WorkflowHandler,
        },
        session_manager::ChatSessionManager,
        system_prompt_service::SystemPromptService,
        EventBroadcaster,
    },
    storage::StorageProvider,
};
use anyhow::Result;
use copilot_client::CopilotClientTrait;
use log::info;
use std::sync::Arc;
use uuid::Uuid;

use super::llm_request_builder::LlmRequestBuilder;

// Phase modules (private to this module)
mod approval_flow;
mod error_handling;
mod initialization;
mod llm_processor; // NEW: LLM processing logic
mod message_intake;
mod stream_processor; // NEW: SSE stream processing
mod utils;

// Import utilities

/// Handles the main agent loop and message processing
///
/// This is the coordinator that orchestrates message processing through
/// different lifecycle phases. It maintains dependencies and delegates
/// AgentLoopHandler - 主协调器
///
/// 负责处理 Agent Loop 的完整生命周期
pub struct AgentLoopHandler<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    copilot_client: Arc<dyn CopilotClientTrait>,
    system_prompt_service: Arc<SystemPromptService>,
    event_broadcaster: Option<Arc<EventBroadcaster>>,
    tool_executor: Arc<crate::services::tool_coordinator::ToolExecutor>,
    approval_manager: Arc<crate::services::approval_manager::ApprovalManager>,
    agent_service: Arc<crate::services::AgentService>,
    // Message handlers
    file_reference_handler: FileReferenceHandler<T>,
    workflow_handler: WorkflowHandler<T>,
    tool_result_handler: ToolResultHandler<T>,
    text_message_handler: TextMessageHandler<T>,
}

impl<T: StorageProvider + 'static> AgentLoopHandler<T> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_manager: Arc<ChatSessionManager<T>>,
        copilot_client: Arc<dyn CopilotClientTrait>,
        system_prompt_service: Arc<SystemPromptService>,
        event_broadcaster: Option<Arc<EventBroadcaster>>,
        tool_executor: Arc<crate::services::tool_coordinator::ToolExecutor>,
        approval_manager: Arc<crate::services::approval_manager::ApprovalManager>,
        agent_service: Arc<crate::services::AgentService>,
        file_reference_handler: FileReferenceHandler<T>,
        workflow_handler: WorkflowHandler<T>,
        tool_result_handler: ToolResultHandler<T>,
        text_message_handler: TextMessageHandler<T>,
    ) -> Self {
        Self {
            session_manager,
            copilot_client,
            system_prompt_service,
            event_broadcaster,
            tool_executor,
            approval_manager,
            agent_service,
            file_reference_handler,
            workflow_handler,
            tool_result_handler,
            text_message_handler,
        }
    }

    fn llm_request_builder(&self) -> LlmRequestBuilder {
        LlmRequestBuilder::new(self.system_prompt_service.clone())
    }

    fn agent_loop_runner(&self, conversation_id: Uuid) -> AgentLoopRunner<T> {
        AgentLoopRunner::new(
            self.session_manager.clone(),
            conversation_id,
            self.tool_executor.clone(),
            self.approval_manager.clone(),
            self.agent_service.clone(),
            self.copilot_client.clone(),
            self.llm_request_builder(),
        )
    }

    /// 🎯 Unified Entry Point: Process message (non-streaming)
    ///
    /// Coordinates the full message processing lifecycle:
    /// 1. Initialization - Load context and setup
    /// 2. Message Intake - Handle different payload types
    /// 3. LLM Request - Make LLM call and process response
    ///
    /// This is the primary public interface for message processing.
    pub async fn process_message(
        &mut self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        info!("=== AgentLoopHandler::process_message START ===");
        info!("Conversation ID: {}", conversation_id);
        info!(
            "Payload type: {}",
            message_builder::describe_payload(&request.payload)
        );

        // 1️⃣ INITIALIZATION PHASE
        let context = initialization::load_context_for_request(
            &self.session_manager,
            conversation_id,
            &request,
        )
        .await?;
        info!("Context loaded successfully");

        let display_text = message_builder::compute_display_text(&request);

        {
            let context_lock = context.read().await;
            tracing::info!(
                trace_id = ?context_lock.get_trace_id(),
                context_id = %context_lock.id,
                state_before = ?context_lock.current_state,
                message_pool_size = context_lock.message_pool.len(),
                "AgentLoopHandler: process_message starting"
            );
        }

        // 2️⃣ MESSAGE INTAKE PHASE
        if let Some(response) = message_intake::handle_request_payload(
            &self.file_reference_handler,
            &self.workflow_handler,
            &self.tool_result_handler,
            &self.text_message_handler,
            &context,
            conversation_id,
            &request.payload,
            &display_text,
            &request.client_metadata,
        )
        .await?
        {
            info!("=== AgentLoopHandler::process_message END (early return) ===");
            return Ok(response);
        }

        // 3️⃣ LLM REQUEST PHASE - Delegated to llm_processor
        let llm_request = self.llm_request_builder().build(&context).await?;

        initialization::save_system_prompt_from_request(
            &self.session_manager,
            conversation_id,
            &llm_request,
        )
        .await
        .ok(); // Log warning is handled inside

        info!(
            "Calling LLM with {} messages, model: {}",
            llm_request.request.messages.len(),
            llm_request.prepared.model_id
        );

        // Delegate to LLM processor
        let result = llm_processor::process_llm_request(
            &self.copilot_client,
            &self.session_manager,
            &self.event_broadcaster,
            &context,
            llm_request.request,
            conversation_id,
        )
        .await;

        info!("=== AgentLoopHandler::process_message END ===");
        result
    }

    /// 🎯 Unified Entry Point: Process message with streaming (SSE)
    ///
    /// Coordinates streaming message processing with Server-Sent Events:
    /// 1. Initialization - Load context
    /// 2. Message Intake - Handle payload
    /// 3. LLM Streaming - Stream responses via SSE
    ///
    /// Returns an SSE stream for real-time updates.
    pub async fn process_message_stream(
        &mut self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<
        actix_web_lab::sse::Sse<
            actix_web_lab::util::InfallibleStream<
                tokio_stream::wrappers::ReceiverStream<actix_web_lab::sse::Event>,
            >,
        >,
        AppError,
    > {
        info!("=== AgentLoopHandler::process_message_stream START ===");
        info!("Conversation ID: {}", conversation_id);
        info!(
            "Payload type: {}",
            message_builder::describe_payload(&request.payload)
        );

        // Delegate to stream processor
        stream_processor::create_sse_stream(
            self.session_manager.clone(),
            self.copilot_client.clone(),
            self.event_broadcaster.clone(),
            self.llm_request_builder(),
            self.agent_service.clone(),
            self.tool_executor.clone(),
            self.approval_manager.clone(),
            &self.file_reference_handler,
            &self.workflow_handler,
            &self.tool_result_handler,
            &self.text_message_handler,
            conversation_id,
            request,
        )
        .await
    }

    /// Continue agent loop after tool approval
    pub async fn continue_agent_loop_after_approval(
        &mut self,
        conversation_id: Uuid,
        request_id: Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse, AppError> {
        approval_flow::continue_agent_loop_after_approval(
            &self.session_manager,
            &self.approval_manager,
            &self.tool_executor,
            &self.agent_service,
            &self.copilot_client,
            self.llm_request_builder(),
            conversation_id,
            request_id,
            approved,
            reason,
        )
        .await
    }

    /// Approve tool calls (legacy method)
    pub async fn approve_tool_calls(
        &mut self,
        conversation_id: Uuid,
        approved_tool_calls: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        approval_flow::approve_tool_calls(
            &self.session_manager,
            conversation_id,
            approved_tool_calls,
        )
        .await
    }
}
