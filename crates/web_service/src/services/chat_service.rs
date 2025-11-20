use crate::{
    error::AppError,
    models::{ClientMessageMetadata, MessagePayload, SendMessageRequest},
    services::workflow_service::WorkflowService,
    storage::StorageProvider,
};
use actix_web_lab::{sse, util::InfallibleStream};
use bytes::Bytes;
use context_manager::structs::system_prompt_snapshot::{PromptSource, SystemPromptSnapshot};
use context_manager::{
    structs::tool::DisplayPreference, ChatContext, ChatEvent, ContextState, ContextUpdate,
    IncomingMessage, IncomingTextMessage, MessageMetadata, MessageTextSnapshot, MessageType, Role,
    ToolCallRequest, ToolCallResult,
};
use copilot_client::CopilotClientTrait;
use futures_util::StreamExt;
use log::{error, info};
use serde::Serialize;
use serde_json::json;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tool_system::ToolExecutor;
use tracing;
use uuid::Uuid;

use super::agent_loop_runner::AgentLoopRunner;
use super::agent_service::AgentService;
use super::approval_manager::ApprovalManager;
use super::context_tool_runtime::ContextToolRuntime;
use super::copilot_stream_handler;
use super::llm_request_builder::LlmRequestBuilder;
use super::llm_utils::{detect_message_type, send_context_update};
use super::session_manager::ChatSessionManager;
use super::system_prompt_service::SystemPromptService;

#[derive(Debug, Serialize)]
pub enum ServiceResponse {
    FinalMessage(String),
    AwaitingToolApproval(Vec<ToolCallRequest>),
    /// Agent-initiated tool call requires approval
    #[serde(rename = "awaiting_agent_approval")]
    AwaitingAgentApproval {
        request_id: uuid::Uuid,
        session_id: uuid::Uuid,
        tool_name: String,
        tool_description: String,
        parameters: serde_json::Value,
    },
}

#[derive(Debug)]
struct FinalizedMessage {
    message_id: Uuid,
    sequence: u64,
    summary: String,
}

#[allow(dead_code)]
pub struct ChatService<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
    system_prompt_service: Arc<SystemPromptService>,
    agent_service: Arc<AgentService>,
    approval_manager: Arc<ApprovalManager>,
    workflow_service: Arc<WorkflowService>,
    event_broadcaster: Option<Arc<crate::services::EventBroadcaster>>,
}

fn stringify_tool_output(value: &serde_json::Value) -> String {
    if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
        return content.to_string();
    }

    if let Some(message) = value.get("message").and_then(|v| v.as_str()) {
        return message.to_string();
    }

    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

// Helper function to convert internal Role to client Role
fn describe_payload(payload: &MessagePayload) -> &'static str {
    match payload {
        MessagePayload::Text { .. } => "text",
        MessagePayload::FileReference { .. } => "file_reference",
        MessagePayload::Workflow { .. } => "workflow",
        MessagePayload::ToolResult { .. } => "tool_result",
    }
}

fn compute_display_text(request: &SendMessageRequest) -> String {
    if let Some(display_text) = &request.client_metadata.display_text {
        return display_text.clone();
    }

    match &request.payload {
        MessagePayload::Text { content, display } => {
            display.clone().unwrap_or_else(|| content.clone())
        }
        MessagePayload::FileReference {
            paths,
            display_text,
            ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("读取文件 {:?}", paths)),
        MessagePayload::Workflow {
            workflow,
            display_text,
            ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("执行工作流 {}", workflow)),
        MessagePayload::ToolResult {
            tool_name,
            display_text,
            ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("工具 {} 的执行结果", tool_name)),
    }
}

fn convert_client_metadata(metadata: &ClientMessageMetadata) -> Option<MessageMetadata> {
    let mut extra = metadata.extra.clone();

    if let Some(trace_id) = &metadata.trace_id {
        extra
            .entry("trace_id".to_string())
            .or_insert_with(|| json!(trace_id));
    }

    if extra.is_empty() {
        None
    } else {
        Some(MessageMetadata {
            extra: Some(extra),
            ..Default::default()
        })
    }
}

fn build_incoming_text_message(
    content: &str,
    payload_display: Option<&str>,
    metadata: &ClientMessageMetadata,
) -> IncomingMessage {
    let display_text = metadata
        .display_text
        .clone()
        .or_else(|| payload_display.map(|value| value.to_string()));

    let mut message = IncomingTextMessage::with_display_text(content.to_string(), display_text);

    if let Some(meta) = convert_client_metadata(metadata) {
        message.metadata = Some(meta);
    }

    IncomingMessage::Text(message)
}

impl<T: StorageProvider + 'static> ChatService<T> {
    /// Create a new ChatService (Phase 2.0 - Pipeline-based)
    ///
    /// Note: SystemPromptEnhancer is no longer required. System prompt enhancement
    /// is now handled by the Pipeline architecture in ChatContext.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_manager: Arc<ChatSessionManager<T>>,
        conversation_id: Uuid,
        copilot_client: Arc<dyn CopilotClientTrait>,
        tool_executor: Arc<ToolExecutor>,
        system_prompt_service: Arc<SystemPromptService>,
        approval_manager: Arc<ApprovalManager>,
        workflow_service: Arc<WorkflowService>,
    ) -> Self {
        Self {
            session_manager,
            conversation_id,
            copilot_client,
            tool_executor,
            system_prompt_service,
            agent_service: Arc::new(AgentService::with_default_config()),
            approval_manager,
            workflow_service,
            event_broadcaster: None,
        }
    }

    /// Set the event broadcaster for Signal-Pull SSE
    pub fn with_event_broadcaster(
        mut self,
        broadcaster: Arc<crate::services::EventBroadcaster>,
    ) -> Self {
        self.event_broadcaster = Some(broadcaster);
        self
    }

    /// Send a Signal-Pull SSE event
    async fn send_sse_event(&self, event: crate::controllers::context_controller::SignalEvent) {
        if let Some(broadcaster) = &self.event_broadcaster {
            log::debug!("Sending SSE event: {:?}", event);
            if let Ok(data) = actix_web_lab::sse::Data::new_json(&event) {
                let sse_event = actix_web_lab::sse::Event::Data(data.event("signal"));
                broadcaster.broadcast(self.conversation_id, sse_event).await;
                log::debug!("SSE event broadcasted successfully");
            } else {
                log::error!("Failed to serialize SSE event to JSON");
            }
        } else {
            log::warn!(
                "EventBroadcaster is None, cannot send SSE event: {:?}",
                event
            );
        }
    }

    async fn save_system_prompt_from_request(
        &self,
        context_id: Uuid,
        llm_request: &crate::services::llm_request_builder::BuiltLlmRequest,
    ) -> Result<(), AppError> {
        let mut enhanced_prompt = String::new();
        if let Some(first_msg) = llm_request.request.messages.first() {
            if first_msg.role == copilot_client::api::models::Role::System {
                if let copilot_client::api::models::Content::Text(content) = &first_msg.content {
                    enhanced_prompt = content.clone();
                }
            }
        }

        if !enhanced_prompt.is_empty() {
            let source = if let Some(id) = &llm_request.prepared.system_prompt_id {
                PromptSource::Service {
                    prompt_id: id.clone(),
                }
            } else {
                PromptSource::Default
            };

            let available_tools = llm_request
                .prepared
                .available_tools
                .iter()
                .map(|t| t.name.clone())
                .collect();

            let snapshot = SystemPromptSnapshot::new(
                1,
                context_id,
                llm_request.prepared.agent_role.clone(),
                source,
                enhanced_prompt,
                available_tools,
            );

            self.session_manager
                .save_system_prompt_snapshot(context_id, &snapshot)
                .await?;
        }
        Ok(())
    }

    fn llm_request_builder(&self) -> LlmRequestBuilder {
        LlmRequestBuilder::new(self.system_prompt_service.clone())
    }

    fn agent_loop_runner(&self) -> AgentLoopRunner<T> {
        AgentLoopRunner::new(
            self.session_manager.clone(),
            self.conversation_id,
            self.tool_executor.clone(),
            self.approval_manager.clone(),
            self.agent_service.clone(),
            self.copilot_client.clone(),
            self.llm_request_builder(),
        )
    }

    async fn apply_incoming_message(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        incoming: IncomingMessage,
    ) -> Result<Vec<ContextUpdate>, AppError> {
        let stream = {
            let mut ctx = context.write().await;
            ctx.send_message(incoming)
                .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
        };

        let updates = stream.collect::<Vec<ContextUpdate>>().await;
        Ok(updates)
    }

    /// Execute file reference: read files or list directories
    /// Returns Ok(()) to allow AI call to proceed
    async fn execute_file_reference(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        paths: &[String],
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<(), AppError> {
        // 1. Add user message
        let incoming = build_incoming_text_message(display_text, Some(display_text), metadata);
        self.apply_incoming_message(context, incoming).await?;
        self.session_manager.auto_save_if_dirty(context).await?;

        let runtime =
            ContextToolRuntime::new(self.tool_executor.clone(), self.approval_manager.clone());

        // 2. Process each path
        for path in paths {
            let path_obj = std::path::Path::new(path);

            if path_obj.is_dir() {
                // Directory: use list_directory tool with depth=1
                let mut arguments = serde_json::Map::new();
                arguments.insert("path".to_string(), json!(path));
                arguments.insert("depth".to_string(), json!(1));

                let mut context_lock = context.write().await;
                context_lock
                    .process_auto_tool_step(
                        &runtime,
                        "list_directory".to_string(),
                        serde_json::Value::Object(arguments),
                        false,
                        None,
                    )
                    .await
                    .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?;
            } else {
                // File: use read_file tool
                let mut arguments = serde_json::Map::new();
                arguments.insert("path".to_string(), json!(path));

                let mut context_lock = context.write().await;
                context_lock
                    .process_auto_tool_step(
                        &runtime,
                        "read_file".to_string(),
                        serde_json::Value::Object(arguments),
                        false,
                        None,
                    )
                    .await
                    .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?;
            }
        }

        self.session_manager.auto_save_if_dirty(context).await?;

        // ✅ Return Ok(()) to allow AI call to proceed
        Ok(())
    }

    async fn execute_workflow(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        workflow: &str,
        parameters: &HashMap<String, serde_json::Value>,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<FinalizedMessage, AppError> {
        let incoming = build_incoming_text_message(display_text, Some(display_text), metadata);
        self.apply_incoming_message(context, incoming).await?;
        self.session_manager.auto_save_if_dirty(context).await?;

        let execution_result = self
            .workflow_service
            .execute_workflow(workflow, parameters.clone())
            .await;

        let (assistant_text, metadata_payload) = match execution_result {
            Ok(result) => {
                let assistant_text = stringify_tool_output(&result);
                let payload = json!({
                    "workflow_name": workflow,
                    "parameters": parameters,
                    "result": result,
                    "status": "success",
                });
                (assistant_text, payload)
            }
            Err(err) => {
                let error_message = err.to_string();
                let payload = json!({
                    "workflow_name": workflow,
                    "parameters": parameters,
                    "status": "error",
                    "error": error_message,
                });
                (format!("Workflow 执行失败: {}", error_message), payload)
            }
        };

        let (message_id, summary, sequence) = {
            let mut context_lock = context.write().await;
            let mut extra = HashMap::new();
            extra.insert("workflow_name".to_string(), json!(workflow));
            extra.insert("payload".to_string(), metadata_payload.clone());

            let metadata = MessageMetadata {
                extra: Some(extra),
                ..Default::default()
            };

            let (message_id, _) = context_lock.append_text_message_with_metadata(
                Role::Assistant,
                MessageType::ToolResult,
                assistant_text.clone(),
                Some(metadata),
                None,
            );

            let MessageTextSnapshot {
                content, sequence, ..
            } = context_lock
                .message_text_snapshot(message_id)
                .ok_or_else(|| {
                    AppError::InternalError(anyhow::anyhow!(
                        "Message snapshot unavailable after workflow execution"
                    ))
                })?;

            (message_id, content, sequence)
        };

        self.session_manager.auto_save_if_dirty(context).await?;

        Ok(FinalizedMessage {
            message_id,
            sequence,
            summary,
        })
    }

    async fn record_tool_result_message(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        tool_name: &str,
        result: serde_json::Value,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<FinalizedMessage, AppError> {
        let incoming = build_incoming_text_message(display_text, Some(display_text), metadata);
        self.apply_incoming_message(context, incoming).await?;
        self.session_manager.auto_save_if_dirty(context).await?;

        let tool_result_text = stringify_tool_output(&result);

        let (message_id, summary, sequence) = {
            let mut context_lock = context.write().await;

            let mut extra = HashMap::new();
            extra.insert("tool_name".to_string(), json!(tool_name));
            extra.insert("payload".to_string(), result.clone());

            let message_metadata = MessageMetadata {
                extra: Some(extra),
                ..Default::default()
            };

            let (message_id, _) = context_lock.append_text_message_with_metadata(
                Role::Tool,
                MessageType::ToolResult,
                tool_result_text.clone(),
                Some(message_metadata),
                Some(ToolCallResult {
                    request_id: tool_name.to_string(),
                    result: result.clone(),
                    display_preference: DisplayPreference::Default,
                }),
            );

            let MessageTextSnapshot {
                content, sequence, ..
            } = context_lock
                .message_text_snapshot(message_id)
                .ok_or_else(|| {
                    AppError::InternalError(anyhow::anyhow!(
                        "Message snapshot unavailable after recording tool result"
                    ))
                })?;

            (message_id, content, sequence)
        };

        self.session_manager.auto_save_if_dirty(context).await?;

        Ok(FinalizedMessage {
            message_id,
            sequence,
            summary,
        })
    }

    async fn build_message_signal_sse(
        context_id: Uuid,
        message_id: Uuid,
        sequence: u64,
    ) -> Result<
        sse::Sse<InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>>,
        AppError,
    > {
        let (tx, rx) = mpsc::channel::<sse::Event>(4);

        let payload = json!({
            "context_id": context_id,
            "message_id": message_id,
            "sequence": sequence,
            "is_final": true,
        });

        let content_event = sse::Data::new_json(payload)
            .map(|data| sse::Event::Data(data.event("content_final")))
            .map_err(|err| {
                AppError::InternalError(anyhow::anyhow!(format!(
                    "Failed to serialise content_final payload: {}",
                    err
                )))
            })?;

        if tx.send(content_event).await.is_err() {
            return Err(AppError::InternalError(anyhow::anyhow!(
                "Failed to emit content_final event"
            )));
        }

        if let Ok(done_event) = sse::Data::new_json(json!({ "done": true })) {
            let _ = tx.send(sse::Event::Data(done_event.event("done"))).await;
        }
        let _ = tx.send(sse::Event::Data(sse::Data::new("[DONE]"))).await;

        drop(tx);

        Ok(sse::Sse::from_infallible_receiver(rx).with_keep_alive(Duration::from_secs(15)))
    }

    pub async fn process_message(
        &mut self,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        log::info!("=== ChatService::process_message START ===");
        log::info!("Conversation ID: {}", self.conversation_id);
        log::info!("Payload type: {}", describe_payload(&request.payload));

        let context = self
            .session_manager
            .load_context(
                self.conversation_id,
                request.client_metadata.trace_id.clone(),
            )
            .await?
            .ok_or_else(|| {
                log::error!("Session not found: {}", self.conversation_id);
                AppError::NotFound("Session".to_string())
            })?;

        log::info!("Context loaded successfully");

        let display_text = compute_display_text(&request);

        {
            let context_lock = context.read().await;
            let trace_id = context_lock.get_trace_id().map(|s| s.to_string());

            tracing::info!(
                trace_id = ?trace_id,
                context_id = %context_lock.id,
                state_before = ?context_lock.current_state,
                message_pool_size = context_lock.message_pool.len(),
                "ChatService: process_message starting"
            );

            log::info!(
                "Current context state before adding message: {:?}",
                context_lock.current_state
            );
            log::info!("Message pool size: {}", context_lock.message_pool.len());
        }

        match &request.payload {
            MessagePayload::FileReference { paths, .. } => {
                // ✅ Execute file reference but don't return - let AI call proceed
                self.execute_file_reference(
                    &context,
                    paths,
                    &display_text,
                    &request.client_metadata,
                )
                .await?;
                // ✅ Don't return - continue to LLM call below
            }
            MessagePayload::Workflow {
                workflow,
                parameters,
                ..
            } => {
                let finalized = self
                    .execute_workflow(
                        &context,
                        workflow,
                        parameters,
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;

                // Send SSE event to notify frontend
                self.send_sse_event(
                    crate::controllers::context_controller::SignalEvent::MessageCompleted {
                        context_id: self.conversation_id.to_string(),
                        message_id: finalized.message_id.to_string(),
                        final_sequence: finalized.sequence,
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    },
                )
                .await;

                log::info!("=== ChatService::process_message END (structured workflow) ===");
                return Ok(ServiceResponse::FinalMessage(finalized.summary));
            }
            MessagePayload::ToolResult {
                tool_name, result, ..
            } => {
                let finalized = self
                    .record_tool_result_message(
                        &context,
                        tool_name,
                        result.clone(),
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!("=== ChatService::process_message END (structured tool result) ===");
                return Ok(ServiceResponse::FinalMessage(finalized.summary));
            }
            MessagePayload::Text { content, display } => {
                let incoming = build_incoming_text_message(
                    content,
                    display.as_deref(),
                    &request.client_metadata,
                );
                self.apply_incoming_message(&context, incoming).await?;
                self.session_manager.auto_save_if_dirty(&context).await?;
            }
        }

        let llm_request = self.llm_request_builder().build(&context).await?;

        // Save system prompt snapshot
        if let Err(e) = self
            .save_system_prompt_from_request(self.conversation_id, &llm_request)
            .await
        {
            log::warn!("Failed to save system prompt snapshot: {}", e);
        }

        log::info!(
            "User message added to branch '{}'",
            llm_request.prepared.branch_name
        );
        log::info!(
            "Message pool size after add: {}",
            llm_request.prepared.total_messages
        );

        let mut request = llm_request.request.clone();
        request.stream = Some(true);

        log::info!(
            "Calling LLM with {} messages, model: {}",
            request.messages.len(),
            llm_request.prepared.model_id
        );

        // Transition to AwaitingLLMResponse using context_manager's method
        {
            let mut ctx = context.write().await;
            let _updates = ctx.transition_to_awaiting_llm();
            log::info!("FSM: Transitioned to AwaitingLLMResponse");
        }

        // Call the real LLM
        match self
            .copilot_client
            .send_chat_completion_request(request)
            .await
        {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    let body_text = match response.text().await {
                        Ok(text) => text,
                        Err(err) => {
                            log::warn!("Failed to read LLM error body: {}", err);
                            String::new()
                        }
                    };
                    let error_msg = if body_text.is_empty() {
                        format!("LLM API error. Status: {}", status)
                    } else {
                        format!("LLM API error. Status: {} Body: {}", status, body_text)
                    };
                    error!("{}", error_msg);

                    {
                        let mut context_lock = context.write().await;
                        // Use context_manager's error handling method
                        let _updates = context_lock.handle_llm_error(error_msg.clone());

                        let mut extra = HashMap::new();
                        extra.insert("error".to_string(), json!(error_msg));
                        let metadata = MessageMetadata {
                            extra: Some(extra),
                            ..Default::default()
                        };

                        context_lock.append_text_message_with_metadata(
                            Role::Assistant,
                            MessageType::Text,
                            format!("I ran into a problem talking to the model: {}", error_msg),
                            Some(metadata),
                            None,
                        );
                    }

                    self.session_manager.auto_save_if_dirty(&context).await?;
                    return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
                }

                let mut full_text = String::new();
                let mut assistant_message_id: Option<Uuid> = None;

                let (chunk_tx, mut chunk_rx) = mpsc::channel::<anyhow::Result<Bytes>>(100);
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
                                log::info!("Stream completed");
                                break;
                            }

                            match serde_json::from_slice::<
                                copilot_client::api::models::ChatCompletionStreamChunk,
                            >(&bytes)
                            {
                                Ok(chunk) => {
                                    if let Some(choice) = chunk.choices.first() {
                                        if let Some(content) = &choice.delta.content {
                                            full_text.push_str(content);

                                            let message_id = if let Some(id) = assistant_message_id
                                            {
                                                id
                                            } else {
                                                let message_id = {
                                                    let mut ctx = context.write().await;
                                                    // Use begin_streaming_llm_response to create StreamingResponse message
                                                    let message_id = ctx
                                                        .begin_streaming_llm_response(Some(
                                                            llm_request.prepared.model_id.clone(),
                                                        ));
                                                    log::info!(
                                                        "FSM: AwaitingLLMResponse -> StreamingLLMResponse (with rich streaming)"
                                                    );
                                                    message_id
                                                };
                                                assistant_message_id = Some(message_id);

                                                // Send MessageCreated event
                                                self.send_sse_event(
                                                    crate::controllers::context_controller::SignalEvent::MessageCreated {
                                                        message_id: message_id.to_string(),
                                                        role: "assistant".to_string(),
                                                    }
                                                ).await;

                                                message_id
                                            };

                                            let sequence = {
                                                let mut ctx = context.write().await;
                                                // Use append_streaming_chunk to add chunks with sequence tracking
                                                ctx.append_streaming_chunk(
                                                    message_id,
                                                    content.clone(),
                                                )
                                            };

                                            // Send ContentDelta event (only if sequence is available)
                                            if let Some(seq) = sequence {
                                                self.send_sse_event(
                                                    crate::controllers::context_controller::SignalEvent::ContentDelta {
                                                        context_id: self.conversation_id.to_string(),
                                                        message_id: message_id.to_string(),
                                                        current_sequence: seq,
                                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                                    }
                                                ).await;
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    log::error!("Failed to parse chunk: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Error in stream: {}", e);
                            if let Some(message_id) = assistant_message_id {
                                let mut ctx = context.write().await;
                                // abort_streaming_response already handles error state transition
                                let _ = ctx.abort_streaming_response(
                                    message_id,
                                    format!("stream error: {}", e),
                                );
                            }
                            return Err(AppError::InternalError(anyhow::anyhow!(
                                "Stream error: {}",
                                e
                            )));
                        }
                    }
                }

                if let Err(e) = processor_handle.await {
                    log::error!("Stream processor failed: {}", e);
                }

                if let Some(message_id) = assistant_message_id {
                    let (final_text, final_sequence) = {
                        let mut ctx = context.write().await;
                        // Finalize the streaming response with rich chunk tracking
                        ctx.finalize_streaming_response(message_id, Some("stop".to_string()), None);
                        log::info!("FSM: Finished streaming response");

                        let text = ctx.message_pool.get(&message_id).map(|node| {
                            node.message
                                .content
                                .iter()
                                .filter_map(|part| part.text_content())
                                .collect::<String>()
                        });

                        let sequence = ctx.get_streaming_sequence(message_id).unwrap_or(0);

                        (text, sequence)
                    };

                    // Send MessageCompleted event
                    self.send_sse_event(
                        crate::controllers::context_controller::SignalEvent::MessageCompleted {
                            context_id: self.conversation_id.to_string(),
                            message_id: message_id.to_string(),
                            final_sequence,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        },
                    )
                    .await;

                    if let Some(text) = final_text {
                        full_text = text;
                    }
                } else {
                    // No message was created, transition directly to Idle
                    let mut ctx = context.write().await;
                    if matches!(ctx.current_state, ContextState::AwaitingLLMResponse) {
                        ctx.current_state = ContextState::Idle;
                    }
                    drop(ctx);
                }

                info!("✅ LLM response received: {} chars", full_text.len());

                // Check for tool call in response
                let tool_call_opt = self
                    .agent_service
                    .parse_tool_call_from_response(&full_text)
                    .map_err(|e| {
                        AppError::InternalError(anyhow::anyhow!("Failed to parse tool call: {}", e))
                    })?;

                if let Some(tool_call) = tool_call_opt {
                    log::info!("Tool call detected: {:?}", tool_call);

                    // Validate tool call
                    self.agent_service
                        .validate_tool_call(&tool_call)
                        .map_err(|e| {
                            AppError::InternalError(anyhow::anyhow!("Invalid tool call: {}", e))
                        })?;

                    // Execute tool and handle agent loop
                    let runner = self.agent_loop_runner();
                    return runner.start(context, tool_call, &full_text).await;
                }

                // No tool call - regular text response
                // Detect message type
                let message_type = detect_message_type(&full_text);
                log::info!("Detected message type: {:?}", message_type);

                if let Some(message_id) = assistant_message_id {
                    let mut context_lock = context.write().await;
                    if let Some(node) = context_lock.message_pool.get_mut(&message_id) {
                        node.message.message_type = message_type.clone();
                    }
                    drop(context_lock);
                } else {
                    let mut context_lock = context.write().await;
                    context_lock.append_text_message_with_metadata(
                        Role::Assistant,
                        message_type.clone(),
                        full_text.clone(),
                        None,
                        None,
                    );
                }

                // Auto-save
                log::info!("Auto-saving after processing response");
                self.session_manager.auto_save_if_dirty(&context).await?;
                log::info!("Auto-save completed");

                log::info!("=== ChatService::process_message END ===");
                Ok(ServiceResponse::FinalMessage(full_text))
            }
            Err(e) => {
                let error_msg = format!("LLM call failed: {:?}", e);
                error!("{}", error_msg);

                {
                    let mut context_lock = context.write().await;
                    context_lock.handle_event(ChatEvent::FatalError {
                        error: error_msg.clone(),
                    });

                    let mut extra = HashMap::new();
                    extra.insert("error".to_string(), json!(error_msg));
                    let metadata = MessageMetadata {
                        extra: Some(extra),
                        ..Default::default()
                    };

                    context_lock.append_text_message_with_metadata(
                        Role::Assistant,
                        MessageType::Text,
                        format!("Sorry, I couldn't connect to the LLM: {}", e),
                        Some(metadata),
                        None,
                    );
                }

                self.session_manager.auto_save_if_dirty(&context).await?;
                Err(AppError::InternalError(anyhow::anyhow!(error_msg)))
            }
        }
    }

    /// Process a message with streaming response (SSE)
    pub async fn process_message_stream(
        &mut self,
        request: SendMessageRequest,
    ) -> Result<
        sse::Sse<InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>>,
        AppError,
    > {
        log::info!("=== ChatService::process_message_stream START ===");
        log::info!("Conversation ID: {}", self.conversation_id);
        log::info!("Payload type: {}", describe_payload(&request.payload));

        let context = self
            .session_manager
            .load_context(
                self.conversation_id,
                request.client_metadata.trace_id.clone(),
            )
            .await?
            .ok_or_else(|| {
                log::error!("Session not found: {}", self.conversation_id);
                AppError::NotFound("Session".to_string())
            })?;

        log::info!("Context loaded successfully");

        let display_text = compute_display_text(&request);

        match &request.payload {
            MessagePayload::FileReference { paths, .. } => {
                // ✅ Execute file reference but don't return - let AI streaming proceed
                self.execute_file_reference(
                    &context,
                    paths,
                    &display_text,
                    &request.client_metadata,
                )
                .await?;
                // ✅ Don't return - continue to LLM streaming below
            }
            MessagePayload::Workflow {
                workflow,
                parameters,
                ..
            } => {
                let finalized = self
                    .execute_workflow(
                        &context,
                        workflow,
                        parameters,
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!("=== ChatService::process_message_stream END (structured workflow) ===");
                return Self::build_message_signal_sse(
                    self.conversation_id,
                    finalized.message_id,
                    finalized.sequence,
                )
                .await;
            }
            MessagePayload::ToolResult {
                tool_name, result, ..
            } => {
                let finalized = self
                    .record_tool_result_message(
                        &context,
                        tool_name,
                        result.clone(),
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!(
                    "=== ChatService::process_message_stream END (structured tool result) ==="
                );
                return Self::build_message_signal_sse(
                    self.conversation_id,
                    finalized.message_id,
                    finalized.sequence,
                )
                .await;
            }
            MessagePayload::Text { .. } => {
                // Channel setup deferred until after match
            }
        }

        let (event_tx, event_rx) = mpsc::channel::<sse::Event>(100);

        if let MessagePayload::Text { content, display } = &request.payload {
            let incoming =
                build_incoming_text_message(content, display.as_deref(), &request.client_metadata);
            let updates = self.apply_incoming_message(&context, incoming).await?;

            for update in updates {
                if send_context_update(&event_tx, &update).await.is_err() {
                    log::warn!(
                        "Failed to forward context update before streaming; assuming client disconnected"
                    );
                    break;
                }
            }

            self.session_manager.auto_save_if_dirty(&context).await?;
        }

        let sse_response =
            sse::Sse::from_infallible_receiver(event_rx).with_keep_alive(Duration::from_secs(15));

        let llm_request = self.llm_request_builder().build(&context).await?;

        // Save system prompt snapshot
        if let Err(e) = self
            .save_system_prompt_from_request(self.conversation_id, &llm_request)
            .await
        {
            log::warn!("Failed to save system prompt snapshot: {}", e);
        }

        log::info!(
            "Preparing streaming request for branch '{}'",
            llm_request.prepared.branch_name
        );
        log::info!(
            "Message pool size before streaming: {}",
            llm_request.prepared.total_messages
        );

        let mut request = llm_request.request.clone();
        request.stream = Some(true);

        log::info!(
            "Calling LLM with {} messages, model: {}",
            request.messages.len(),
            llm_request.prepared.model_id
        );

        // Transition to AwaitingLLMResponse using context_manager's method
        {
            let mut ctx = context.write().await;
            let updates = ctx.transition_to_awaiting_llm();
            log::info!(
                "FSM: {} -> AwaitingLLMResponse",
                if updates.is_empty() {
                    "unchanged"
                } else {
                    "transitioned"
                }
            );
            // Forward updates to SSE if needed
            for update in updates {
                if send_context_update(&event_tx, &update).await.is_err() {
                    log::warn!("Failed to forward transition_to_awaiting_llm update; client may have disconnected");
                }
            }
        }

        // Call the LLM
        let response = self
            .copilot_client
            .send_chat_completion_request(request)
            .await
            .map_err(|e| AppError::InternalError(anyhow::anyhow!("LLM call failed: {}", e)))?;

        let status = response.status();
        if !status.is_success() {
            let body_text = match response.text().await {
                Ok(text) => text,
                Err(err) => {
                    log::warn!("Failed to read LLM error body: {}", err);
                    String::new()
                }
            };
            let error_msg = if body_text.is_empty() {
                format!("LLM API error. Status: {}", status)
            } else {
                format!("LLM API error. Status: {} Body: {}", status, body_text)
            };

            // Use context_manager's error handling method
            let updates = {
                let mut ctx = context.write().await;
                ctx.handle_llm_error(error_msg.clone())
            };

            // Forward error updates to SSE
            for update in updates {
                let _ = send_context_update(&event_tx, &update).await;
            }

            return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
        }

        // Channel for streaming updates to the frontend
        let (chunk_tx, chunk_rx) = mpsc::channel::<anyhow::Result<Bytes>>(100);
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
            self.conversation_id,
            event_tx.clone(),
        );

        drop(event_tx);

        Ok(sse_response)
    }

    /// Continue agent loop after approval
    pub async fn continue_agent_loop_after_approval(
        &mut self,
        request_id: uuid::Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse, AppError> {
        log::info!(
            "Continuing agent loop after approval: request_id={}, approved={}",
            request_id,
            approved
        );

        // Get and process the approval request
        let tool_call = self
            .approval_manager
            .approve_request(&request_id, approved, reason)
            .await?;

        if !approved {
            log::info!("Tool call rejected by user");
            return Ok(ServiceResponse::FinalMessage(
                "Tool call was rejected by the user.".to_string(),
            ));
        }

        let tool_call = tool_call.ok_or_else(|| {
            AppError::InternalError(anyhow::anyhow!("No tool call in approved request"))
        })?;

        // Load context
        let context = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await?
            .ok_or_else(|| AppError::NotFound("Session".to_string()))?;

        // Continue the agent loop with the approved tool call
        let llm_response = format!("Approved tool call: {}", tool_call.tool);
        self.agent_loop_runner()
            .resume_after_approval(context, tool_call, &llm_response, request_id)
            .await
    }

    pub async fn approve_tool_calls(
        &mut self,
        _approved_tool_calls: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        let context = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await?
            .ok_or_else(|| AppError::NotFound("Session".to_string()))?;
        let final_message = {
            let ctx = context.write().await;
            ctx.get_active_branch()
                .and_then(|branch| branch.message_ids.last())
                .and_then(|message_id| ctx.message_pool.get(message_id))
                .map(|node| {
                    node.message
                        .content
                        .iter()
                        .filter_map(|part| part.text_content())
                        .collect::<String>()
                })
                .filter(|content| !content.is_empty())
                .unwrap_or_else(|| "Tool approvals handled automatically.".to_string())
        };

        self.session_manager.auto_save_if_dirty(&context).await?;
        Ok(ServiceResponse::FinalMessage(final_message))
    }
}

#[cfg(test)]
mod tests {
    use super::{ChatService, ServiceResponse};
    use crate::error::AppError;
    use crate::models::{
        ClientMessageMetadata, MessagePayload, SendMessageRequest, SendMessageRequestBody,
    };
    use crate::services::approval_manager::ApprovalManager;
    use crate::services::llm_request_builder::LlmRequestBuilder;
    use crate::services::session_manager::ChatSessionManager;
    use crate::services::system_prompt_service::SystemPromptService;
    use crate::services::workflow_service::WorkflowService;
    use crate::storage::StorageProvider;
    use anyhow::bail;
    use async_trait::async_trait;
    use bytes::Bytes;
    use context_manager::structs::system_prompt_snapshot::SystemPromptSnapshot;
    use context_manager::structs::tool::DisplayPreference;
    use context_manager::ChatContext;
    use context_manager::{MessageType, Role};
    use copilot_client::{api::models::ChatCompletionRequest, CopilotClientTrait};
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use tokio::sync::mpsc::Sender;
    use tool_system::registry::ToolRegistry;
    use tool_system::ToolExecutor;
    use uuid::Uuid;
    use workflow_system::WorkflowRegistry;

    #[derive(Default)]
    struct MemoryStorageProvider {
        contexts: Mutex<HashMap<Uuid, ChatContext>>,
        snapshots: Mutex<HashMap<Uuid, SystemPromptSnapshot>>,
    }

    #[async_trait]
    impl StorageProvider for MemoryStorageProvider {
        async fn load_context(&self, id: Uuid) -> crate::error::Result<Option<ChatContext>> {
            Ok(self.contexts.lock().unwrap().get(&id).cloned())
        }

        async fn save_context(&self, context: &ChatContext) -> crate::error::Result<()> {
            self.contexts
                .lock()
                .unwrap()
                .insert(context.id, context.clone());
            Ok(())
        }

        async fn list_contexts(&self) -> crate::error::Result<Vec<Uuid>> {
            Ok(self.contexts.lock().unwrap().keys().cloned().collect())
        }

        async fn delete_context(&self, id: Uuid) -> crate::error::Result<()> {
            self.contexts.lock().unwrap().remove(&id);
            Ok(())
        }

        async fn save_system_prompt_snapshot(
            &self,
            context_id: Uuid,
            snapshot: &SystemPromptSnapshot,
        ) -> crate::error::Result<()> {
            self.snapshots
                .lock()
                .unwrap()
                .insert(context_id, snapshot.clone());
            Ok(())
        }

        async fn load_system_prompt_snapshot(
            &self,
            context_id: Uuid,
        ) -> crate::error::Result<Option<SystemPromptSnapshot>> {
            Ok(self.snapshots.lock().unwrap().get(&context_id).cloned())
        }
    }

    struct NoopCopilotClient;

    #[async_trait]
    impl CopilotClientTrait for NoopCopilotClient {
        async fn send_chat_completion_request(
            &self,
            _request: ChatCompletionRequest,
        ) -> anyhow::Result<reqwest::Response> {
            bail!("noop client should not be used in tests")
        }

        async fn process_chat_completion_stream(
            &self,
            _response: reqwest::Response,
            _tx: Sender<anyhow::Result<Bytes>>,
        ) -> anyhow::Result<()> {
            bail!("noop client should not be used in tests")
        }

        async fn get_models(&self) -> anyhow::Result<Vec<String>> {
            Ok(vec!["gpt-test".to_string()])
        }
    }

    struct TestEnv {
        chat_service: ChatService<MemoryStorageProvider>,
        context: Arc<tokio::sync::RwLock<ChatContext>>,
        conversation_id: Uuid,
        _session_manager: Arc<ChatSessionManager<MemoryStorageProvider>>,
        storage: Arc<MemoryStorageProvider>,
        _temp_dir: TempDir,
    }

    async fn setup_test_env() -> TestEnv {
        let storage = Arc::new(MemoryStorageProvider::default());
        let tool_registry = Arc::new(Mutex::new(
            tool_system::registry::registration::create_default_tool_registry(),
        ));
        let session_manager = Arc::new(ChatSessionManager::new(
            storage.clone(),
            8,
            tool_registry.clone(),
        ));
        let temp_dir = TempDir::new().unwrap();
        let system_prompt_service =
            Arc::new(SystemPromptService::new(temp_dir.path().to_path_buf()));
        let tool_executor = Arc::new(ToolExecutor::new(Arc::new(Mutex::new(ToolRegistry::new()))));
        let approval_manager = Arc::new(ApprovalManager::new());
        let workflow_service = Arc::new(WorkflowService::new(Arc::new(WorkflowRegistry::new())));
        let conversation_context = session_manager
            .create_session("gpt-test".into(), "chat".into(), None)
            .await
            .expect("create session");
        let conversation_id = {
            let guard = conversation_context.read().await;
            guard.id
        };

        let copilot_client: Arc<dyn CopilotClientTrait> = Arc::new(NoopCopilotClient);
        let chat_service = ChatService::new(
            session_manager.clone(),
            conversation_id,
            copilot_client,
            tool_executor,
            system_prompt_service,
            approval_manager,
            workflow_service,
        );

        TestEnv {
            chat_service,
            context: conversation_context,
            conversation_id,
            _session_manager: session_manager,
            storage,
            _temp_dir: temp_dir,
        }
    }

    #[tokio::test]
    async fn record_tool_result_message_appends_metadata_and_tool_result() {
        let TestEnv {
            chat_service,
            context,
            conversation_id: _,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        let metadata = ClientMessageMetadata::default();
        let tool_name = "dummy_tool";
        let result_payload = json!({
            "content": "tool output",
            "extra": { "value": 1 },
        });
        let expected_payload = result_payload.clone();
        let display_text = "Tool execution finished";

        let finalized = chat_service
            .record_tool_result_message(
                &context,
                tool_name,
                result_payload,
                display_text,
                &metadata,
            )
            .await
            .expect("tool result recorded");

        assert_eq!(finalized.summary, "tool output");

        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");
        assert_eq!(branch.message_ids.len(), 2);

        let user_node = context_guard
            .message_pool
            .get(&branch.message_ids[0])
            .expect("user message present");
        assert_eq!(user_node.message.role, Role::User);

        let tool_node = context_guard
            .message_pool
            .get(&finalized.message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Tool);
        assert_eq!(tool_node.message.message_type, MessageType::ToolResult);

        let metadata = tool_node
            .message
            .metadata
            .as_ref()
            .expect("metadata recorded");
        let extra = metadata.extra.as_ref().expect("metadata.extra recorded");
        assert_eq!(extra.get("tool_name"), Some(&json!(tool_name)));
        assert_eq!(extra.get("payload"), Some(&expected_payload));

        let tool_result = tool_node
            .message
            .tool_result
            .as_ref()
            .expect("tool result attached");
        assert_eq!(tool_result.request_id, tool_name);
        assert_eq!(tool_result.result, expected_payload);

        drop(context_guard);
    }

    #[tokio::test]
    async fn process_workflow_message_success_records_tool_result() {
        let TestEnv {
            chat_service,
            context,
            conversation_id,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        let mut chat_service = chat_service;

        let mut parameters = HashMap::new();
        parameters.insert("message".to_string(), json!("hello"));

        let request = SendMessageRequest::from_parts(
            conversation_id,
            SendMessageRequestBody {
                payload: MessagePayload::Workflow {
                    workflow: "echo".to_string(),
                    parameters: parameters.clone(),
                    display_text: Some("执行 echo 工作流".to_string()),
                },
                client_metadata: ClientMessageMetadata::default(),
            },
        );

        let response = chat_service
            .process_message(request)
            .await
            .expect("workflow message processed");

        match response {
            ServiceResponse::FinalMessage(text) => {
                assert!(text.contains("\"success\": true"));
            }
            _ => panic!("unexpected response variant"),
        }

        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");
        assert_eq!(branch.message_ids.len(), 2);

        let tool_message_id = *branch.message_ids.last().unwrap();
        let tool_node = context_guard
            .message_pool
            .get(&tool_message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Assistant);
        assert_eq!(tool_node.message.message_type, MessageType::ToolResult);

        let extra = tool_node
            .message
            .metadata
            .as_ref()
            .and_then(|meta| meta.extra.as_ref())
            .expect("metadata extra present");
        assert_eq!(extra.get("workflow_name"), Some(&json!("echo")));
        let payload = extra.get("payload").expect("workflow payload recorded");
        assert_eq!(payload["status"], json!("success"));
        assert_eq!(payload["parameters"], json!(parameters));
        assert_eq!(payload["result"]["echo"], json!("hello"));

        drop(context_guard);
    }

    #[tokio::test]
    async fn process_workflow_message_failure_records_error_metadata() {
        let TestEnv {
            chat_service,
            context,
            conversation_id,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        let mut chat_service = chat_service;

        let request = SendMessageRequest::from_parts(
            conversation_id,
            SendMessageRequestBody {
                payload: MessagePayload::Workflow {
                    workflow: "nonexistent".to_string(),
                    parameters: HashMap::new(),
                    display_text: None,
                },
                client_metadata: ClientMessageMetadata::default(),
            },
        );

        let response = chat_service
            .process_message(request)
            .await
            .expect("workflow failure handled");

        match response {
            ServiceResponse::FinalMessage(text) => {
                assert!(text.contains("Workflow 执行失败"));
            }
            _ => panic!("unexpected response variant"),
        }

        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");
        assert_eq!(branch.message_ids.len(), 2);

        let tool_message_id = *branch.message_ids.last().unwrap();
        let tool_node = context_guard
            .message_pool
            .get(&tool_message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Assistant);
        assert_eq!(tool_node.message.message_type, MessageType::ToolResult);

        let extra = tool_node
            .message
            .metadata
            .as_ref()
            .and_then(|meta| meta.extra.as_ref())
            .expect("metadata extra present");
        assert_eq!(extra.get("workflow_name"), Some(&json!("nonexistent")));
        let payload = extra.get("payload").expect("workflow payload recorded");
        assert_eq!(payload["status"], json!("error"));
        assert!(payload["error"]
            .as_str()
            .unwrap()
            .contains("Workflow execution failed"));

        drop(context_guard);
    }

    /// Test file reference with single file
    #[tokio::test]
    async fn test_file_reference_single_file() {
        let TestEnv {
            chat_service,
            context,
            conversation_id: _,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        // Create a test file
        let test_file = _temp_dir.path().join("test.txt");
        std::fs::write(&test_file, "Hello, World!").unwrap();

        // Execute file reference
        chat_service
            .execute_file_reference(
                &context,
                &[test_file.to_str().unwrap().to_string()],
                "@test.txt what's the content?",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + tool result message
        assert_eq!(branch.message_ids.len(), 2);

        // Check user message
        let user_message_id = branch.message_ids[0];
        let user_node = context_guard
            .message_pool
            .get(&user_message_id)
            .expect("user message present");
        assert_eq!(user_node.message.role, Role::User);

        // Check tool result message
        let tool_message_id = branch.message_ids[1];
        let tool_node = context_guard
            .message_pool
            .get(&tool_message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Tool);
        assert_eq!(tool_node.message.message_type, MessageType::ToolResult);

        // Verify tool result has display_preference: Hidden
        let tool_result = tool_node
            .message
            .tool_result
            .as_ref()
            .expect("tool result present");
        assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);

        drop(context_guard);
    }

    /// Test file reference with multiple files
    #[tokio::test]
    async fn test_file_reference_multiple_files() {
        let TestEnv {
            chat_service,
            context,
            conversation_id: _,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        // Create test files
        let test_file1 = _temp_dir.path().join("file1.txt");
        let test_file2 = _temp_dir.path().join("file2.txt");
        std::fs::write(&test_file1, "Content 1").unwrap();
        std::fs::write(&test_file2, "Content 2").unwrap();

        let paths = vec![
            test_file1.to_str().unwrap().to_string(),
            test_file2.to_str().unwrap().to_string(),
        ];

        // Execute file reference
        chat_service
            .execute_file_reference(
                &context,
                &paths,
                "@file1.txt @file2.txt compare these",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + 2 tool result messages
        assert_eq!(branch.message_ids.len(), 3);

        // Check both tool results have display_preference: Hidden
        for i in 1..=2 {
            let tool_message_id = branch.message_ids[i];
            let tool_node = context_guard
                .message_pool
                .get(&tool_message_id)
                .expect("tool message present");
            assert_eq!(tool_node.message.role, Role::Tool);

            let tool_result = tool_node
                .message
                .tool_result
                .as_ref()
                .expect("tool result present");
            assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);
        }

        drop(context_guard);
    }

    /// Test file reference with directory
    #[tokio::test]
    async fn test_file_reference_directory() {
        let TestEnv {
            chat_service,
            context,
            conversation_id: _,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        // Create a test directory with files
        let test_dir = _temp_dir.path().join("test_folder");
        std::fs::create_dir(&test_dir).unwrap();
        std::fs::write(test_dir.join("file1.txt"), "File 1").unwrap();
        std::fs::write(test_dir.join("file2.txt"), "File 2").unwrap();

        let paths = vec![test_dir.to_str().unwrap().to_string()];

        // Execute file reference
        chat_service
            .execute_file_reference(
                &context,
                &paths,
                "@test_folder/ what files are here?",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + tool result message (list_directory)
        assert_eq!(branch.message_ids.len(), 2);

        // Check tool result
        let tool_message_id = branch.message_ids[1];
        let tool_node = context_guard
            .message_pool
            .get(&tool_message_id)
            .expect("tool message present");
        assert_eq!(tool_node.message.role, Role::Tool);

        // Verify tool result has display_preference: Hidden
        let tool_result = tool_node
            .message
            .tool_result
            .as_ref()
            .expect("tool result present");
        assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);

        drop(context_guard);
    }

    /// Test file reference with mixed files and directories
    #[tokio::test]
    async fn test_file_reference_mixed() {
        let TestEnv {
            chat_service,
            context,
            conversation_id: _,
            _session_manager: _,
            storage: _,
            _temp_dir,
        } = setup_test_env().await;

        // Create test file and directory
        let test_file = _temp_dir.path().join("readme.txt");
        let test_dir = _temp_dir.path().join("src");
        std::fs::write(&test_file, "README content").unwrap();
        std::fs::create_dir(&test_dir).unwrap();
        std::fs::write(test_dir.join("main.rs"), "fn main() {}").unwrap();

        let paths = vec![
            test_file.to_str().unwrap().to_string(),
            test_dir.to_str().unwrap().to_string(),
        ];

        // Execute file reference
        chat_service
            .execute_file_reference(
                &context,
                &paths,
                "@readme.txt @src/ analyze the project",
                &ClientMessageMetadata::default(),
            )
            .await
            .expect("file reference executed");

        // Verify context state
        let context_guard = context.read().await;
        let branch = context_guard
            .get_active_branch()
            .expect("active branch available");

        // Should have: user message + 2 tool result messages (read_file + list_directory)
        assert_eq!(branch.message_ids.len(), 3);

        // Check both tool results have display_preference: Hidden
        for i in 1..=2 {
            let tool_message_id = branch.message_ids[i];
            let tool_node = context_guard
                .message_pool
                .get(&tool_message_id)
                .expect("tool message present");
            assert_eq!(tool_node.message.role, Role::Tool);

            let tool_result = tool_node
                .message
                .tool_result
                .as_ref()
                .expect("tool result present");
            assert_eq!(tool_result.display_preference, DisplayPreference::Hidden);
        }

        drop(context_guard);
    }

    #[tokio::test]
    async fn test_system_prompt_persistence() {
        let TestEnv {
            mut chat_service,
            context: _,
            conversation_id,
            _session_manager: _,
            storage,
            _temp_dir: _,
        } = setup_test_env().await;

        let mut parameters = HashMap::new();
        parameters.insert("message".to_string(), json!("test"));

        let request = SendMessageRequest::from_parts(
            conversation_id,
            SendMessageRequestBody {
                payload: MessagePayload::Workflow {
                    workflow: "echo".to_string(),
                    parameters: parameters.clone(),
                    display_text: Some("Test workflow".to_string()),
                },
                client_metadata: ClientMessageMetadata::default(),
            },
        );

        // Process message (workflow execution doesn't call LLM)
        chat_service
            .process_message(request)
            .await
            .expect("message processed");

        // Note: System prompt snapshot is NOT saved for workflow messages
        // since they don't build LLM requests. This test verifies the storage
        // interface works correctly. For actual system prompt persistence testing,
        // we would need integration tests with a mock LLM client.

        // Verify that the storage provider's save method can be called
        // (even though workflow messages don't trigger it)
        let snapshot_result = storage
            .load_system_prompt_snapshot(conversation_id)
            .await
            .expect("load should not error");

        // Workflow messages don't save system prompts, so this should be None
        assert!(
            snapshot_result.is_none(),
            "Workflow messages should not save system prompt snapshots"
        );
    }
}
