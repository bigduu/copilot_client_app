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
    models::{MessagePayload, SendMessageRequest, ServiceResponse},
    services::{
        agent_loop_runner::AgentLoopRunner,
        copilot_stream_handler, message_builder,
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
use bytes::Bytes;
use context_manager::ContextUpdate;
use copilot_client::CopilotClientTrait;
use futures_util::StreamExt;
use log::{error, info};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::llm_request_builder::LlmRequestBuilder;

// Phase modules (private to this module)
mod approval_flow;
mod error_handling;
mod initialization;
mod message_intake;
mod utils;

// Import utilities
use utils::send_context_update;

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

        // 3️⃣ LLM REQUEST PHASE
        let llm_request = self.llm_request_builder().build(&context).await?;

        if let Err(e) = initialization::save_system_prompt_from_request(
            &self.session_manager,
            conversation_id,
            &llm_request,
        )
        .await
        {
            log::warn!("Failed to save system prompt snapshot: {}", e);
        }

        info!(
            "Calling LLM with {} messages, model: {}",
            llm_request.request.messages.len(),
            llm_request.prepared.model_id
        );

        let mut request = llm_request.request.clone();
        request.stream = Some(true);

        // Transition to AwaitingLLMResponse
        {
            let mut ctx = context.write().await;
            let _updates = ctx.transition_to_awaiting_llm();
            info!("FSM: Transitioned to AwaitingLLMResponse");
        }

        // Call LLM
        match self
            .copilot_client
            .send_chat_completion_request(request)
            .await
        {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    let body_text = response.text().await.unwrap_or_default();
                    let error_msg = if body_text.is_empty() {
                        format!("LLM API error. Status: {}", status)
                    } else {
                        format!("LLM API error. Status: {} Body: {}", status, body_text)
                    };
                    error!("{}", error_msg);
                    return Err(error_handling::handle_llm_error(
                        &self.session_manager,
                        &context,
                        error_msg,
                    )
                    .await);
                }

                let mut full_text = String::new();
                let mut assistant_message_id: Option<Uuid> = None;

                let (chunk_tx, mut chunk_rx) = mpsc::channel::<Result<Bytes>>(100);
                let copilot_client = self.copilot_client.clone();
                let processor_handle = tokio::spawn(async move {
                    copilot_client
                        .process_chat_completion_stream(response, chunk_tx)
                        .await
                });

                while let Some(chunk_result) = chunk_rx.recv().await {
                    match chunk_result {
                        Ok(bytes) => {
                            if bytes.as_ref() == b"[DONE]" {
                                info!("Stream completed");
                                break;
                            }

                            if let Ok(chunk) = serde_json::from_slice::<
                                copilot_client::api::models::ChatCompletionStreamChunk,
                            >(&bytes)
                            {
                                copilot_stream_handler::handle_stream_chunk(
                                    &context,
                                    chunk,
                                    &mut full_text,
                                    &mut assistant_message_id,
                                )
                                .await?;
                            }
                        }
                        Err(e) => {
                            error!("Stream error: {}", e);
                            return Err(error_handling::handle_llm_error(
                                &self.session_manager,
                                &context,
                                e.to_string(),
                            )
                            .await);
                        }
                    }
                }

                if let Err(e) = processor_handle.await {
                    error!("Stream processor panicked: {}", e);
                    return Err(error_handling::handle_llm_error(
                        &self.session_manager,
                        &context,
                        "Stream processor panicked".to_string(),
                    )
                    .await);
                }

                // Send SSE event for completion
                if let Some(msg_id) = assistant_message_id {
                    let final_sequence = {
                        let ctx = context.read().await;
                        ctx.message_sequence(msg_id).unwrap_or(0)
                    };

                    error_handling::send_sse_event(
                        &self.event_broadcaster,
                        crate::controllers::context::streaming::SignalEvent::MessageCompleted {
                            context_id: conversation_id.to_string(),
                            message_id: msg_id.to_string(),
                            final_sequence,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    )
                    .await;
                }

                self.session_manager.auto_save_if_dirty(&context).await?;

                info!("=== AgentLoopHandler::process_message END ===");
                Ok(ServiceResponse::FinalMessage(full_text))
            }
            Err(e) => {
                error!("Failed to send request to LLM: {}", e);
                Err(error_handling::handle_llm_error(
                    &self.session_manager,
                    &context,
                    e.to_string(),
                )
                .await)
            }
        }
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
        use super::sse_response_builder;
        use actix_web_lab::sse;
        use std::time::Duration;

        info!("=== AgentLoopHandler::process_message_stream START ===");
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
        let (event_tx, event_rx) = mpsc::channel::<sse::Event>(100);

        // 2️⃣ MESSAGE INTAKE PHASE - Handle special payloads
        if let Some(_response) = message_intake::handle_request_payload(
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
            let context_id = {
                let ctx = context.read().await;
                ctx.id
            };

            match &request.payload {
                MessagePayload::Workflow { .. } => {
                    info!("=== AgentLoopHandler::process_message_stream END (workflow) ===");
                    return sse_response_builder::build_message_signal_sse(
                        context_id,
                        Uuid::new_v4(),
                        0,
                    );
                }
                MessagePayload::ToolResult { .. } => {
                    info!("=== AgentLoopHandler::process_message_stream END (tool result) ===");
                    return sse_response_builder::build_message_signal_sse(
                        context_id,
                        Uuid::new_v4(),
                        0,
                    );
                }
                _ => {
                    unreachable!("handle_request_payload only returns Some for Workflow/ToolResult")
                }
            }
        }

        // Handle text messages inline
        if let MessagePayload::Text { content, display } = &request.payload {
            let incoming = message_builder::build_incoming_text_message(
                content,
                display.as_deref(),
                &request.client_metadata,
            );

            let stream = {
                let mut ctx = context.write().await;
                ctx.send_message(incoming)
                    .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
            };
            let updates = stream.collect::<Vec<ContextUpdate>>().await;

            for update in updates {
                if send_context_update(&event_tx, &update).await.is_err() {
                    log::warn!("Client disconnected before streaming");
                    break;
                }
            }

            self.session_manager.auto_save_if_dirty(&context).await?;
        }

        let sse_response =
            sse::Sse::from_infallible_receiver(event_rx).with_keep_alive(Duration::from_secs(15));

        // 3️⃣ LLM STREAMING PHASE
        let llm_request = self.llm_request_builder().build(&context).await?;

        if let Err(e) = initialization::save_system_prompt_from_request(
            &self.session_manager,
            conversation_id,
            &llm_request,
        )
        .await
        {
            log::warn!("Failed to save system prompt snapshot: {}", e);
        }

        info!(
            "Calling LLM with {} messages, model: {}",
            llm_request.request.messages.len(),
            llm_request.prepared.model_id
        );

        let mut request = llm_request.request.clone();
        request.stream = Some(true);

        // Transition to AwaitingLLMResponse
        {
            let mut ctx = context.write().await;
            let updates = ctx.transition_to_awaiting_llm();
            info!("FSM: Transitioned to AwaitingLLMResponse");

            for update in updates {
                let _ = send_context_update(&event_tx, &update).await;
            }
        }

        // Call LLM
        let response = self
            .copilot_client
            .send_chat_completion_request(request)
            .await
            .map_err(|e| AppError::InternalError(anyhow::anyhow!("LLM call failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_default();
            let error_msg = if body_text.is_empty() {
                format!("LLM API error. Status: {}", status)
            } else {
                format!("LLM API error. Status: {} Body: {}", status, body_text)
            };

            let updates = {
                let mut ctx = context.write().await;
                ctx.handle_llm_error(error_msg.clone())
            };

            for update in updates {
                let _ = send_context_update(&event_tx, &update).await;
            }

            return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
        }

        // Stream processing
        let (chunk_tx, chunk_rx) = mpsc::channel::<Result<Bytes>>(100);
        let copilot_client = self.copilot_client.clone();
        let processor_handle = tokio::spawn(async move {
            copilot_client
                .process_chat_completion_stream(response, chunk_tx)
                .await
        });

        copilot_stream_handler::spawn_stream_task(
            chunk_rx,
            processor_handle,
            self.session_manager.clone(),
            self.agent_service.clone(),
            self.tool_executor.clone(),
            self.approval_manager.clone(),
            conversation_id,
            event_tx.clone(),
        );

        drop(event_tx);

        Ok(sse_response)
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
