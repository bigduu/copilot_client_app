use crate::{
    error::AppError,
    models::{ClientMessageMetadata, FileRange, MessagePayload, SendMessageRequest},
    services::workflow_service::WorkflowService,
    storage::StorageProvider,
};
use actix_web_lab::{sse, util::InfallibleStream};
use bytes::Bytes;
use context_manager::{
    ChatContext, ChatEvent, ContentPart, ContextState, IncomingMessage, IncomingTextMessage,
    InternalMessage, MessageMetadata, MessageType, Role, ToolCallRequest, ToolCallResult,
};
use copilot_client::api::models::{
    ChatCompletionStreamChunk, Role as ClientRole, StreamChoice, StreamDelta,
};
use copilot_client::CopilotClientTrait;
use futures_util::StreamExt;
use log::{debug, error, info};
use serde::Serialize;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::mpsc;
use tool_system::{types::ToolArguments, ToolExecutor};
use tracing;
use uuid::Uuid;

use super::agent_loop_runner::AgentLoopRunner;
use super::agent_service::AgentService;
use super::approval_manager::ApprovalManager;
use super::copilot_stream_handler;
use super::llm_request_builder::LlmRequestBuilder;
use super::llm_utils::{detect_message_type, send_context_update};
use super::session_manager::ChatSessionManager;
use super::system_prompt_enhancer::SystemPromptEnhancer;
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

#[allow(dead_code)]
pub struct ChatService<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
    system_prompt_enhancer: Arc<SystemPromptEnhancer>,
    system_prompt_service: Arc<SystemPromptService>,
    agent_service: Arc<AgentService>,
    approval_manager: Arc<ApprovalManager>,
    workflow_service: Arc<WorkflowService>,
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
            path, display_text, ..
        } => display_text
            .clone()
            .unwrap_or_else(|| format!("读取文件 {}", path)),
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

fn incoming_message_from_payload(payload: &MessagePayload) -> Option<IncomingMessage> {
    match payload {
        MessagePayload::Text {
            content, display, ..
        } => Some(IncomingMessage::Text(
            IncomingTextMessage::with_display_text(content.clone(), display.clone()),
        )),
        _ => None,
    }
}

impl<T: StorageProvider + 'static> ChatService<T> {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_manager: Arc<ChatSessionManager<T>>,
        conversation_id: Uuid,
        copilot_client: Arc<dyn CopilotClientTrait>,
        tool_executor: Arc<ToolExecutor>,
        system_prompt_enhancer: Arc<SystemPromptEnhancer>,
        system_prompt_service: Arc<SystemPromptService>,
        approval_manager: Arc<ApprovalManager>,
        workflow_service: Arc<WorkflowService>,
    ) -> Self {
        Self {
            session_manager,
            conversation_id,
            copilot_client,
            tool_executor,
            system_prompt_enhancer,
            system_prompt_service,
            agent_service: Arc::new(AgentService::with_default_config()),
            approval_manager,
            workflow_service,
        }
    }

    fn llm_request_builder(&self) -> LlmRequestBuilder {
        LlmRequestBuilder::new(
            self.system_prompt_enhancer.clone(),
            self.system_prompt_service.clone(),
        )
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

    async fn add_user_message(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<(), AppError> {
        let mut user_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::Text {
                text: text.to_string(),
            }],
            ..Default::default()
        };

        let mut extra = metadata.extra.clone();
        if let Some(display_text) = &metadata.display_text {
            extra
                .entry("display_text".to_string())
                .or_insert(json!(display_text));
        }
        if let Some(trace_id) = &metadata.trace_id {
            extra
                .entry("trace_id".to_string())
                .or_insert(json!(trace_id));
        }

        if !extra.is_empty() {
            user_message.metadata = Some(MessageMetadata {
                extra: Some(extra),
                ..Default::default()
            });
        }

        {
            let mut context_lock = context.write().await;
            let _ = context_lock.add_message_to_branch("main", user_message);
            context_lock.handle_event(ChatEvent::UserMessageSent);
        }

        self.auto_save_context(context).await?;
        Ok(())
    }

    async fn execute_file_reference(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        path: &str,
        range: &Option<FileRange>,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<String, AppError> {
        self.add_user_message(context, display_text, metadata)
            .await?;

        {
            let mut context_lock = context.write().await;
            context_lock.handle_event(ChatEvent::LLMRequestInitiated);
            context_lock.handle_event(ChatEvent::LLMStreamStarted);
        }

        let mut args_map = serde_json::Map::new();
        args_map.insert(
            "path".to_string(),
            serde_json::Value::String(path.to_string()),
        );

        if let Some(range) = range {
            if let Some(start_line) = range.start_line {
                args_map.insert(
                    "start_line".to_string(),
                    serde_json::Value::String(start_line.to_string()),
                );
            }
            if let Some(end_line) = range.end_line {
                args_map.insert(
                    "end_line".to_string(),
                    serde_json::Value::String(end_line.to_string()),
                );
            }
        }

        let request_id = Uuid::new_v4().to_string();
        let path_for_payload = path.to_string();
        let tool_result = self
            .tool_executor
            .execute_tool(
                "read_file",
                ToolArguments::Json(serde_json::Value::Object(args_map)),
            )
            .await;

        let (result_payload, file_content, is_error) = match tool_result {
            Ok(value) => {
                let content = stringify_tool_output(&value);
                let payload_json = json!({
                    "tool_name": "read_file",
                    "path": path_for_payload,
                    "result": value,
                    "display_preference": "Default",
                    "is_error": false,
                });
                (payload_json, content, false)
            }
            Err(err) => {
                let error_message = err.to_string();
                let payload_json = json!({
                    "tool_name": "read_file",
                    "path": path_for_payload,
                    "error": error_message.clone(),
                    "display_preference": "Default",
                    "is_error": true,
                });
                (
                    payload_json,
                    format!("读取文件失败: {}", error_message),
                    true,
                )
            }
        };

        {
            let mut context_lock = context.write().await;
            let tool_result_text = if is_error {
                file_content.clone()
            } else {
                format!("文件 {} 的内容：\n\n{}", path, file_content)
            };

            let tool_result_message = InternalMessage {
                role: Role::Tool,
                content: vec![ContentPart::Text {
                    text: tool_result_text,
                }],
                tool_result: Some(ToolCallResult {
                    request_id: request_id.clone(),
                    result: result_payload.clone(),
                }),
                message_type: MessageType::ToolResult,
                ..Default::default()
            };
            let _ = context_lock.add_message_to_branch("main", tool_result_message);

            context_lock.handle_event(ChatEvent::LLMStreamEnded);
            context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                has_tool_calls: false,
            });
        }

        self.auto_save_context(context).await?;

        let final_response = if is_error {
            file_content
        } else {
            format!("已读取文件 {} 的内容。", path)
        };
        Ok(final_response)
    }

    async fn execute_workflow(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        workflow: &str,
        parameters: &HashMap<String, serde_json::Value>,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<String, AppError> {
        self.add_user_message(context, display_text, metadata)
            .await?;

        {
            let mut context_lock = context.write().await;
            context_lock.handle_event(ChatEvent::LLMRequestInitiated);
            context_lock.handle_event(ChatEvent::LLMStreamStarted);
        }

        let parameters_clone = parameters.clone();
        let execution_result = self
            .workflow_service
            .execute_workflow(workflow, parameters_clone)
            .await;

        let (result_payload, assistant_text) = match execution_result {
            Ok(value) => {
                let assistant_text = stringify_tool_output(&value);
                let payload_json = json!({
                    "workflow_name": workflow,
                    "parameters": parameters,
                    "result": value,
                    "status": "success",
                });
                (payload_json, assistant_text)
            }
            Err(err) => {
                let error_message = err.to_string();
                let payload_json = json!({
                    "workflow_name": workflow,
                    "parameters": parameters,
                    "status": "error",
                    "error": error_message,
                });
                (
                    payload_json,
                    format!("Workflow 执行失败: {}", error_message),
                )
            }
        };

        {
            let mut context_lock = context.write().await;
            let mut extra = HashMap::new();
            extra.insert("workflow_name".to_string(), json!(&workflow));
            extra.insert("payload".to_string(), result_payload.clone());

            let workflow_message = InternalMessage {
                role: Role::Assistant,
                content: vec![ContentPart::Text {
                    text: assistant_text.clone(),
                }],
                metadata: Some(MessageMetadata {
                    extra: Some(extra),
                    ..Default::default()
                }),
                message_type: MessageType::ToolResult,
                ..Default::default()
            };
            let _ = context_lock.add_message_to_branch("main", workflow_message);

            context_lock.handle_event(ChatEvent::LLMStreamEnded);
            context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                has_tool_calls: false,
            });
        }

        self.auto_save_context(context).await?;

        Ok(assistant_text)
    }

    async fn record_tool_result_message(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
        tool_name: &str,
        result: serde_json::Value,
        display_text: &str,
        metadata: &ClientMessageMetadata,
    ) -> Result<String, AppError> {
        self.add_user_message(context, display_text, metadata)
            .await?;

        let result_text = stringify_tool_output(&result);
        let request_id = Uuid::new_v4().to_string();

        {
            let mut context_lock = context.write().await;

            let tool_message = InternalMessage {
                role: Role::Tool,
                content: vec![ContentPart::Text {
                    text: result_text.clone(),
                }],
                tool_result: Some(ToolCallResult {
                    request_id: request_id.clone(),
                    result: result.clone(),
                }),
                message_type: MessageType::ToolResult,
                ..Default::default()
            };
            let _ = context_lock.add_message_to_branch("main", tool_message);

            context_lock.handle_event(ChatEvent::LLMStreamEnded);
            context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                has_tool_calls: false,
            });
        }

        self.auto_save_context(context).await?;

        Ok(format!("工具 {} 的执行结果已记录。", tool_name))
    }

    async fn build_text_sse(
        text: String,
    ) -> Result<
        sse::Sse<InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>>,
        AppError,
    > {
        let chunk = ChatCompletionStreamChunk {
            id: Uuid::new_v4().to_string(),
            object: Some("chat.completion.chunk".to_string()),
            created: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| AppError::InternalError(anyhow::anyhow!(e.to_string())))?
                .as_secs(),
            model: Some("structured-response".to_string()),
            choices: vec![StreamChoice {
                index: 0,
                delta: StreamDelta {
                    role: Some(ClientRole::Assistant),
                    content: Some(text),
                    tool_calls: None,
                },
                finish_reason: None,
            }],
        };

        let chunk_event = serde_json::to_string(&chunk)
            .map(|json| sse::Event::Data(sse::Data::new(json).event("llm_chunk")))
            .map_err(|err| {
                AppError::InternalError(anyhow::anyhow!(format!(
                    "Failed to serialise structured response chunk: {}",
                    err
                )))
            })?;

        let (tx, rx) = mpsc::channel::<sse::Event>(4);
        if tx.send(chunk_event).await.is_err() {
            return Err(AppError::InternalError(anyhow::anyhow!(
                "Failed to emit structured response chunk"
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
                AppError::InternalError(anyhow::anyhow!("Session not found"))
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
            MessagePayload::FileReference { path, range, .. } => {
                let assistant_text = self
                    .execute_file_reference(
                        &context,
                        path,
                        range,
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!("=== ChatService::process_message END (structured file reference) ===");
                return Ok(ServiceResponse::FinalMessage(assistant_text));
            }
            MessagePayload::Workflow {
                workflow,
                parameters,
                ..
            } => {
                let assistant_text = self
                    .execute_workflow(
                        &context,
                        workflow,
                        parameters,
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!("=== ChatService::process_message END (structured workflow) ===");
                return Ok(ServiceResponse::FinalMessage(assistant_text));
            }
            MessagePayload::ToolResult {
                tool_name, result, ..
            } => {
                let assistant_text = self
                    .record_tool_result_message(
                        &context,
                        tool_name,
                        result.clone(),
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!("=== ChatService::process_message END (structured tool result) ===");
                return Ok(ServiceResponse::FinalMessage(assistant_text));
            }
            MessagePayload::Text { .. } => {
                if let Some(incoming) = incoming_message_from_payload(&request.payload) {
                    let send_result = {
                        let mut ctx = context.write().await;
                        ctx.send_message(incoming)
                    };

                    if let Err(err) = send_result {
                        return Err(AppError::InternalError(anyhow::anyhow!(err.to_string())));
                    }
                }
            }
        }

        let llm_request = self.llm_request_builder().build(&context).await?;

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

        // Transition to AwaitingLLMResponse
        {
            let mut ctx = context.write().await;
            ctx.handle_event(ChatEvent::LLMRequestInitiated);
            log::info!("FSM: ProcessingUserMessage -> AwaitingLLMResponse");
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
                        context_lock.handle_event(ChatEvent::FatalError {
                            error: error_msg.clone(),
                        });
                        let error_message = InternalMessage {
                            role: Role::Assistant,
                            content: vec![ContentPart::Text {
                                text: format!(
                                    "I ran into a problem talking to the model: {}",
                                    error_msg
                                ),
                            }],
                            ..Default::default()
                        };
                        let _ = context_lock.add_message_to_branch("main", error_message);
                    }

                    self.auto_save_context(&context).await?;
                    return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
                }

                // Process streaming response with proper FSM events
                let mut full_text = String::new();
                let mut stream_started = false;

                // Create channel for stream processing
                let (chunk_tx, mut chunk_rx) = mpsc::channel::<anyhow::Result<Bytes>>(100);

                // Spawn stream processor
                let copilot_client = self.copilot_client.clone();
                let processor_handle = tokio::spawn(async move {
                    copilot_client
                        .process_chat_completion_stream(response, chunk_tx)
                        .await
                });

                // Process chunks and fire FSM events
                while let Some(chunk_result) = chunk_rx.recv().await {
                    match chunk_result {
                        Ok(bytes) => {
                            // Check for [DONE] signal
                            if bytes == &b"[DONE]"[..] {
                                log::info!("Stream completed");
                                break;
                            }

                            // Parse chunk - using copilot_client types here is OK because we're in chat_service
                            match serde_json::from_slice::<
                                copilot_client::api::models::ChatCompletionStreamChunk,
                            >(&bytes)
                            {
                                Ok(chunk) => {
                                    // Fire LLMStreamStarted on first chunk
                                    if !stream_started {
                                        stream_started = true;
                                        let mut ctx = context.write().await;
                                        ctx.handle_event(ChatEvent::LLMStreamStarted);
                                        log::info!(
                                            "FSM: AwaitingLLMResponse -> StreamingLLMResponse"
                                        );
                                        drop(ctx);
                                    }

                                    // Extract and accumulate content
                                    if let Some(choice) = chunk.choices.first() {
                                        if let Some(content) = &choice.delta.content {
                                            full_text.push_str(content);

                                            // Fire chunk received event
                                            let mut ctx = context.write().await;
                                            ctx.handle_event(ChatEvent::LLMStreamChunkReceived);
                                            drop(ctx);
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
                            let mut context_lock = context.write().await;
                            context_lock.handle_event(ChatEvent::FatalError {
                                error: e.to_string(),
                            });
                            drop(context_lock);
                            return Err(AppError::InternalError(anyhow::anyhow!(
                                "Stream error: {}",
                                e
                            )));
                        }
                    }
                }

                // Wait for processor
                if let Err(e) = processor_handle.await {
                    log::error!("Stream processor failed: {}", e);
                }

                // Fire stream ended event
                {
                    let mut ctx = context.write().await;
                    ctx.handle_event(ChatEvent::LLMStreamEnded);
                    log::info!("FSM: StreamingLLMResponse -> ProcessingLLMResponse");
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

                // Add complete response to context using context_manager types
                let mut context_lock = context.write().await;
                let assistant_message = InternalMessage {
                    role: Role::Assistant,
                    content: vec![ContentPart::Text { text: full_text }],
                    message_type,
                    ..Default::default()
                };
                let _ = context_lock.add_message_to_branch("main", assistant_message);
                log::info!(
                    "Assistant message added to branch, message pool size: {}",
                    context_lock.message_pool.len()
                );

                // Fire response processed event
                context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                    has_tool_calls: false,
                });
                log::info!("FSM: ProcessingLLMResponse -> Idle");
                drop(context_lock);

                // Auto-save
                log::info!("Auto-saving after processing response");
                self.auto_save_context(&context).await?;
                log::info!("Auto-save completed");
            }
            Err(e) => {
                let error_msg = format!("LLM call failed: {:?}", e);
                error!("{}", error_msg);

                let mut context_lock = context.write().await;
                context_lock.handle_event(ChatEvent::FatalError {
                    error: error_msg.clone(),
                });
                let error_message = InternalMessage {
                    role: Role::Assistant,
                    content: vec![ContentPart::Text {
                        text: format!("Sorry, I couldn't connect to the LLM: {}", e),
                    }],
                    ..Default::default()
                };
                let _ = context_lock.add_message_to_branch("main", error_message);
                drop(context_lock);

                self.auto_save_context(&context).await?;
                return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
            }
        }

        // Now run FSM to handle any remaining state transitions
        log::info!("Starting FSM run");
        let result = self.run_fsm(context).await;

        match &result {
            Ok(response) => log::info!("FSM completed successfully: {:?}", response),
            Err(e) => log::error!("FSM failed with error: {:?}", e),
        }

        log::info!("=== ChatService::process_message END ===");
        result
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
                AppError::InternalError(anyhow::anyhow!("Session not found"))
            })?;

        log::info!("Context loaded successfully");

        let display_text = compute_display_text(&request);

        match &request.payload {
            MessagePayload::FileReference { path, range, .. } => {
                let assistant_text = self
                    .execute_file_reference(
                        &context,
                        path,
                        range,
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!(
                    "=== ChatService::process_message_stream END (structured file reference) ==="
                );
                return Self::build_text_sse(assistant_text).await;
            }
            MessagePayload::Workflow {
                workflow,
                parameters,
                ..
            } => {
                let assistant_text = self
                    .execute_workflow(
                        &context,
                        workflow,
                        parameters,
                        &display_text,
                        &request.client_metadata,
                    )
                    .await?;
                log::info!("=== ChatService::process_message_stream END (structured workflow) ===");
                return Self::build_text_sse(assistant_text).await;
            }
            MessagePayload::ToolResult {
                tool_name, result, ..
            } => {
                let assistant_text = self
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
                return Self::build_text_sse(assistant_text).await;
            }
            MessagePayload::Text { .. } => {
                // Channel setup deferred until after match
            }
        }

        let (event_tx, event_rx) = mpsc::channel::<sse::Event>(100);

        if let Some(incoming) = incoming_message_from_payload(&request.payload) {
            let updates_stream = {
                let mut ctx = context.write().await;
                ctx.send_message(incoming)
                    .map_err(|err| AppError::InternalError(anyhow::anyhow!(err.to_string())))?
            };

            let mut updates_stream = updates_stream;
            while let Some(update) = updates_stream.next().await {
                if send_context_update(&event_tx, &update).await.is_err() {
                    log::warn!(
                        "Failed to forward context update before streaming; assuming client disconnected"
                    );
                    break;
                }
            }
        }

        let sse_response =
            sse::Sse::from_infallible_receiver(event_rx).with_keep_alive(Duration::from_secs(15));

        let llm_request = self.llm_request_builder().build(&context).await?;

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

        // Transition to AwaitingLLMResponse
        {
            let mut ctx = context.write().await;
            ctx.handle_event(ChatEvent::LLMRequestInitiated);
            log::info!("FSM: ProcessingUserMessage -> AwaitingLLMResponse");
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
            let mut ctx = context.write().await;
            ctx.handle_event(ChatEvent::FatalError {
                error: error_msg.clone(),
            });
            drop(ctx);
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
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("Session not found")))?;

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
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("Session not found")))?;
        let context_lock = context.write().await;

        // if let Some(branch) = context_lock.get_active_branch_mut() {
        //     if let Some(last_message_id) = branch.message_ids.last() {
        //         if let Some(node) = context_lock.message_pool.get_mut(last_message_id) {
        //             if let Some(tool_calls) = &mut node.message.tool_calls {
        //                 for tool_call in tool_calls {
        //                     if approved_tool_calls.contains(&tool_call.id) {
        //                         tool_call.approval_status =
        //                             context_manager::structs::tool::ApprovalStatus::Approved;
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // }

        // context_lock.handle_event(ChatEvent::ToolCallsApproved);

        drop(context_lock);

        self.run_fsm(context).await
    }

    async fn run_fsm(
        &mut self,
        context: Arc<tokio::sync::RwLock<ChatContext>>,
    ) -> Result<ServiceResponse, AppError> {
        log::info!("=== FSM Loop Starting ===");
        let mut iteration_count = 0;

        let (context_id, trace_id) = {
            let ctx = context.write().await;
            (ctx.id, ctx.get_trace_id().map(|s| s.to_string()))
        };

        loop {
            iteration_count += 1;
            log::info!("FSM iteration #{}", iteration_count);

            let current_state = {
                let context_lock = context.write().await;
                context_lock.current_state.clone()
            };

            tracing::debug!(
                trace_id = ?trace_id,
                context_id = %context_id,
                iteration = iteration_count,
                state = ?current_state,
                "ChatService: FSM iteration"
            );

            log::info!("Current FSM state: {:?}", current_state);

            match current_state {
                ContextState::ProcessingUserMessage => {
                    // This state should be handled in process_message before run_fsm is called
                    // If we reach here, it means the message processing was not completed properly
                    log::warn!("FSM: ProcessingUserMessage state reached in run_fsm - this should have been handled in process_message");

                    // Transition directly to Idle to prevent infinite loop
                    let mut ctx = context.write().await;
                    ctx.current_state = ContextState::Idle;
                    drop(ctx);
                }
                ContextState::ProcessingLLMResponse => {
                    let context_lock = context.write().await;
                    debug!("FSM: ProcessingLLMResponse");
                    let _has_tool_calls = context_lock
                        .get_active_branch()
                        .and_then(|b| b.message_ids.last())
                        .and_then(|id| context_lock.message_pool.get(id))
                        .is_some_and(|node| node.message.tool_calls.is_some());

                    // context_lock.handle_event(ChatEvent::LLMResponseProcessed { has_tool_calls });
                    drop(context_lock);

                    // Auto-save after state transition
                    self.auto_save_context(&context).await?;
                }
                ContextState::ExecutingTool { tool_name, attempt } => {
                    let _context_lock = context.write().await;
                    debug!("FSM: ExecutingTool tool={} attempt={}", tool_name, attempt);
                    // Placeholder for executing tools
                    // context_lock.handle_event(ChatEvent::ToolExecutionCompleted);
                    drop(_context_lock);

                    // Auto-save after state transition
                    self.auto_save_context(&context).await?;
                }
                ContextState::ProcessingToolResults => {
                    let _context_lock = context.write().await;
                    debug!("FSM: ProcessingToolResults");
                    // Placeholder for adding tool results
                    // context_lock.handle_event(ChatEvent::LLMRequestInitiated);
                    drop(_context_lock);

                    // Auto-save after state transition
                    self.auto_save_context(&context).await?;
                }
                ContextState::GeneratingResponse => {
                    let mut context_lock = context.write().await;
                    debug!("FSM: GeneratingResponse -> Calling LLM again");
                    // Placeholder for calling LLM
                    let assistant_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text {
                            text: "This is a mock response after tool execution.".to_string(),
                        }],
                        ..Default::default()
                    };
                    let _ = context_lock.add_message_to_branch("main", assistant_message);
                    // context_lock.handle_event(ChatEvent::LLMFullResponseReceived);
                    drop(context_lock);

                    // Auto-save after state transition
                    self.auto_save_context(&context).await?;
                }
                ContextState::Idle => {
                    log::info!("FSM: Reached Idle state");
                    debug!("FSM: Idle");

                    // Auto-save before returning final response
                    log::info!("Auto-saving before returning final response");
                    self.auto_save_context(&context).await?;

                    let context_lock = context.write().await;
                    log::info!(
                        "Final message pool size: {}",
                        context_lock.message_pool.len()
                    );
                    let final_content = context_lock
                        .get_active_branch()
                        .and_then(|b| b.message_ids.last())
                        .and_then(|id| context_lock.message_pool.get(id))
                        .and_then(|node| node.message.content.first())
                        .and_then(|part| part.text_content())
                        .unwrap_or_default()
                        .to_string();
                    log::info!("Returning final message: {}", final_content);
                    return Ok(ServiceResponse::FinalMessage(final_content));
                }
                ContextState::AwaitingToolApproval {
                    pending_requests,
                    tool_names,
                } => {
                    debug!(
                        "FSM: AwaitingToolApproval pending_requests={:?} tool_names={:?}",
                        pending_requests, tool_names
                    );

                    // Auto-save before returning tool approval request
                    self.auto_save_context(&context).await?;

                    let context_lock = context.write().await;
                    let tool_calls = context_lock
                        .get_active_branch()
                        .and_then(|b| b.message_ids.last())
                        .and_then(|id| context_lock.message_pool.get(id))
                        .and_then(|node| node.message.tool_calls.clone())
                        .unwrap_or_default();
                    return Ok(ServiceResponse::AwaitingToolApproval(tool_calls));
                }
                ContextState::Failed { error } => {
                    error!("FSM: Failed - {}", error);

                    // Auto-save even on failure to preserve error state
                    let _ = self.auto_save_context(&context).await;

                    return Err(AppError::InternalError(anyhow::anyhow!(error)));
                }
                // Other states that don't require action in this loop
                _ => {
                    // This is important to prevent busy-waiting on states like AwaitingLLMResponse
                    // A more robust implementation would use a notification mechanism (e.g., channels)
                    // to wake up the loop when an external event (like LLM response) is ready.
                    // For now, a small sleep will prevent pegging the CPU.
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                }
            }
        }
    }

    /// Auto-save helper that saves context if dirty
    async fn auto_save_context(
        &self,
        context: &Arc<tokio::sync::RwLock<ChatContext>>,
    ) -> Result<(), AppError> {
        let mut context_lock = context.write().await;
        let trace_id = context_lock.get_trace_id().map(|s| s.to_string());
        let context_id = context_lock.id;
        let is_dirty = context_lock.is_dirty();

        tracing::debug!(
            trace_id = ?trace_id,
            context_id = %context_id,
            is_dirty = is_dirty,
            "ChatService: auto_save_context check"
        );

        self.session_manager
            .save_context(&mut *context_lock)
            .await?;
        Ok(())
    }
}
