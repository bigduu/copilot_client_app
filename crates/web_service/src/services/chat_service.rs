use crate::{error::AppError, storage::StorageProvider};
use bytes::Bytes;
use context_manager::fsm::ChatEvent;
use context_manager::structs::{
    message::{ContentPart, InternalMessage, MessageType, Role},
    state::ContextState,
    tool::ToolCallRequest,
};
use copilot_client::api::models::{
    ChatCompletionRequest, ChatMessage, Content, Role as ClientRole,
};
use copilot_client::CopilotClientTrait;
use log::{debug, error, info};
use serde::Serialize;
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tool_system::ToolExecutor;
use tracing;
use uuid::Uuid;

use super::session_manager::ChatSessionManager;

#[derive(Debug, Serialize)]
pub enum ServiceResponse {
    FinalMessage(String),
    AwaitingToolApproval(Vec<ToolCallRequest>),
}

#[allow(dead_code)]
pub struct ChatService<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
}

// Helper function to convert internal Role to client Role
fn convert_role(role: &Role) -> ClientRole {
    match role {
        Role::User => ClientRole::User,
        Role::Assistant => ClientRole::Assistant,
        Role::System => ClientRole::System,
        Role::Tool => ClientRole::Tool,
    }
}

// Helper function to convert internal ContentPart to client Content
fn convert_content(parts: &[ContentPart]) -> Content {
    if parts.len() == 1 {
        if let Some(ContentPart::Text { text }) = parts.first() {
            return Content::Text(text.clone());
        }
    }

    // Multiple parts or complex content
    let client_parts: Vec<copilot_client::api::models::ContentPart> = parts
        .iter()
        .filter_map(|part| match part {
            ContentPart::Text { text } => {
                Some(copilot_client::api::models::ContentPart::Text { text: text.clone() })
            }
            ContentPart::Image { url, detail } => {
                Some(copilot_client::api::models::ContentPart::ImageUrl {
                    image_url: copilot_client::api::models::ImageUrl {
                        url: url.clone(),
                        detail: detail.clone(),
                    },
                })
            }
        })
        .collect();

    Content::Parts(client_parts)
}

// Helper function to convert internal message to client ChatMessage
fn convert_to_chat_message(msg: &InternalMessage) -> ChatMessage {
    ChatMessage {
        role: convert_role(&msg.role),
        content: convert_content(&msg.content),
        tool_calls: None, // Tool calls need separate conversion - skip for now
        tool_call_id: msg.tool_result.as_ref().map(|tr| tr.request_id.clone()),
    }
}

/// Parse the LLM response text and determine the message type
fn detect_message_type(text: &str) -> MessageType {
    // Try to extract JSON from the text
    if let Some(json_str) = extract_json_from_text(text) {
        if let Ok(json) = serde_json::from_str::<JsonValue>(&json_str) {
            // Check if it's a plan
            if json.get("goal").is_some() && json.get("steps").is_some() {
                return MessageType::Plan;
            }
            // Check if it's a question
            if json.get("type").and_then(|v| v.as_str()) == Some("question")
                && json.get("question").is_some()
            {
                return MessageType::Question;
            }
        }
    }

    // Default to text
    MessageType::Text
}

/// Extract JSON from text that might be wrapped in markdown code blocks or mixed with other text
fn extract_json_from_text(text: &str) -> Option<String> {
    // Try to find JSON in markdown code blocks
    if let Some(start) = text.find("```json") {
        if let Some(end) = text[start + 7..].find("```") {
            return Some(text[start + 7..start + 7 + end].trim().to_string());
        }
    }

    // Try to find raw JSON (look for { followed by })
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if end > start {
                return Some(text[start..=end].trim().to_string());
            }
        }
    }

    None
}

impl<T: StorageProvider + 'static> ChatService<T> {
    pub fn new(
        session_manager: Arc<ChatSessionManager<T>>,
        conversation_id: Uuid,
        copilot_client: Arc<dyn CopilotClientTrait>,
        tool_executor: Arc<ToolExecutor>,
    ) -> Self {
        Self {
            session_manager,
            conversation_id,
            copilot_client,
            tool_executor,
        }
    }

    pub async fn process_message(&mut self, message: String) -> Result<ServiceResponse, AppError> {
        log::info!("=== ChatService::process_message START ===");
        log::info!("Conversation ID: {}", self.conversation_id);
        log::info!("User message: {}", message);

        let context = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await?
            .ok_or_else(|| {
                log::error!("Session not found: {}", self.conversation_id);
                AppError::InternalError(anyhow::anyhow!("Session not found"))
            })?;

        log::info!("Context loaded successfully");

        let mut context_lock = context.write().await;
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

        let user_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::Text {
                text: message.clone(),
            }],
            ..Default::default()
        };
        context_lock.add_message_to_branch("main", user_message);
        log::info!("User message added to branch 'main'");
        log::info!(
            "Message pool size after add: {}",
            context_lock.message_pool.len()
        );

        // Transition state: Idle -> ProcessingUserMessage
        context_lock.handle_event(ChatEvent::UserMessageSent);
        log::info!("FSM: Idle -> ProcessingUserMessage");

        // Get messages and model for LLM
        let messages: Vec<InternalMessage> = context_lock
            .get_active_branch()
            .map(|branch| {
                branch
                    .message_ids
                    .iter()
                    .filter_map(|id| context_lock.message_pool.get(id))
                    .map(|node| node.message.clone())
                    .collect()
            })
            .unwrap_or_default();
        let model_id = context_lock.config.model_id.clone();

        drop(context_lock);

        // Auto-save after adding user message
        log::info!("Auto-saving context after adding user message");
        self.auto_save_context(&context).await?;
        log::info!("Context auto-saved successfully");

        // Call LLM with streaming and handle response
        log::info!(
            "Calling LLM with {} messages, model: {}",
            messages.len(),
            model_id
        );

        // Convert to LLM client format
        let chat_messages: Vec<ChatMessage> =
            messages.iter().map(convert_to_chat_message).collect();

        // Build request with streaming enabled
        let request = ChatCompletionRequest {
            model: model_id,
            messages: chat_messages,
            stream: Some(true),
            tools: None,
            tool_choice: None,
            ..Default::default()
        };

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
                    let error_msg = format!("LLM API error. Status: {}", status);
                    error!("{}", error_msg);

                    let mut context_lock = context.write().await;
                    context_lock.handle_event(ChatEvent::FatalError {
                        error: error_msg.clone(),
                    });
                    let error_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text {
                            text: format!("Sorry, I encountered an error: {}", error_msg),
                        }],
                        ..Default::default()
                    };
                    context_lock.add_message_to_branch("main", error_message);
                    drop(context_lock);

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
                context_lock.add_message_to_branch("main", assistant_message);
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
                context_lock.add_message_to_branch("main", error_message);
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
        message: String,
    ) -> Result<ReceiverStream<Result<Bytes, String>>, AppError> {
        log::info!("=== ChatService::process_message_stream START ===");
        log::info!("Conversation ID: {}", self.conversation_id);
        log::info!("User message: {}", message);

        let context = self
            .session_manager
            .load_context(self.conversation_id, None)
            .await?
            .ok_or_else(|| {
                log::error!("Session not found: {}", self.conversation_id);
                AppError::InternalError(anyhow::anyhow!("Session not found"))
            })?;

        log::info!("Context loaded successfully");

        let mut context_lock = context.write().await;

        // Add user message to context
        let user_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::Text {
                text: message.clone(),
            }],
            ..Default::default()
        };
        context_lock.add_message_to_branch("main", user_message);

        // Transition state: Idle -> ProcessingUserMessage
        context_lock.handle_event(ChatEvent::UserMessageSent);
        log::info!("FSM: Idle -> ProcessingUserMessage");

        // Get messages and model for LLM
        let messages: Vec<InternalMessage> = context_lock
            .get_active_branch()
            .map(|branch| {
                branch
                    .message_ids
                    .iter()
                    .filter_map(|id| context_lock.message_pool.get(id))
                    .map(|node| node.message.clone())
                    .collect()
            })
            .unwrap_or_default();
        let model_id = context_lock.config.model_id.clone();

        drop(context_lock);

        // Auto-save after adding user message
        self.auto_save_context(&context).await?;

        // Convert to LLM client format
        let chat_messages: Vec<ChatMessage> =
            messages.iter().map(convert_to_chat_message).collect();

        // Build request with streaming enabled
        let request = ChatCompletionRequest {
            model: model_id,
            messages: chat_messages,
            stream: Some(true),
            tools: None,
            tool_choice: None,
            ..Default::default()
        };

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
            let error_msg = format!("LLM API error. Status: {}", status);
            let mut ctx = context.write().await;
            ctx.handle_event(ChatEvent::FatalError {
                error: error_msg.clone(),
            });
            drop(ctx);
            return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
        }

        // Create channel for streaming to frontend
        let (tx, rx) = mpsc::channel::<Result<Bytes, String>>(100);

        // Clone what we need for the spawned task
        let copilot_client = self.copilot_client.clone();
        let conversation_id = self.conversation_id;
        let session_manager = self.session_manager.clone();

        // Spawn task to process stream
        tokio::spawn(async move {
            let mut full_text = String::new();
            let mut stream_started = false;

            // Create internal channel for copilot client stream processing
            let (chunk_tx, mut chunk_rx) = mpsc::channel::<anyhow::Result<Bytes>>(100);

            // Spawn the stream processor
            let processor_handle = tokio::spawn(async move {
                copilot_client
                    .process_chat_completion_stream(response, chunk_tx)
                    .await
            });

            // Process chunks
            while let Some(chunk_result) = chunk_rx.recv().await {
                match chunk_result {
                    Ok(bytes) => {
                        // Check for [DONE] signal
                        if bytes == &b"[DONE]"[..] {
                            log::info!("Stream completed");
                            break;
                        }

                        // Parse chunk
                        match serde_json::from_slice::<
                            copilot_client::api::models::ChatCompletionStreamChunk,
                        >(&bytes)
                        {
                            Ok(chunk) => {
                                // Fire LLMStreamStarted on first chunk
                                if !stream_started {
                                    stream_started = true;
                                    if let Ok(Some(ctx)) =
                                        session_manager.load_context(conversation_id, None).await
                                    {
                                        let mut ctx_lock = ctx.write().await;
                                        ctx_lock.handle_event(ChatEvent::LLMStreamStarted);
                                        log::info!(
                                            "FSM: AwaitingLLMResponse -> StreamingLLMResponse"
                                        );
                                        drop(ctx_lock);
                                    }
                                }

                                // Extract content from delta
                                if let Some(choice) = chunk.choices.first() {
                                    if let Some(content) = &choice.delta.content {
                                        full_text.push_str(content);

                                        // Fire chunk received event
                                        if let Ok(Some(ctx)) = session_manager
                                            .load_context(conversation_id, None)
                                            .await
                                        {
                                            let mut ctx_lock = ctx.write().await;
                                            ctx_lock
                                                .handle_event(ChatEvent::LLMStreamChunkReceived);
                                            drop(ctx_lock);
                                        }

                                        // Forward the chunk to the client (SSE format)
                                        let sse_data = format!(
                                            "data: {}\n\n",
                                            serde_json::to_string(&serde_json::json!({
                                                "content": content,
                                                "done": false
                                            }))
                                            .unwrap_or_default()
                                        );

                                        if tx.send(Ok(Bytes::from(sse_data))).await.is_err() {
                                            log::warn!("Client disconnected");
                                            break;
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
                        let _ = tx.send(Err(format!("Stream error: {}", e))).await;
                        break;
                    }
                }
            }

            // Wait for processor to finish
            if let Err(e) = processor_handle.await {
                log::error!("Stream processor task failed: {}", e);
            }

            // Save the complete message to context and fire FSM completion events
            if !full_text.is_empty() {
                if let Ok(Some(context)) = session_manager.load_context(conversation_id, None).await
                {
                    let mut context_lock = context.write().await;

                    // Fire stream ended event
                    context_lock.handle_event(ChatEvent::LLMStreamEnded);
                    log::info!("FSM: StreamingLLMResponse -> ProcessingLLMResponse");

                    // Detect message type
                    let message_type = detect_message_type(&full_text);

                    let assistant_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text {
                            text: full_text.clone(),
                        }],
                        message_type,
                        ..Default::default()
                    };
                    context_lock.add_message_to_branch("main", assistant_message);

                    // Fire response processed event
                    context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                        has_tool_calls: false,
                    });
                    log::info!("FSM: ProcessingLLMResponse -> Idle");

                    // Auto-save context
                    if let Err(e) = session_manager.save_context(&mut *context_lock).await {
                        log::error!("Failed to save context after streaming: {}", e);
                    }
                    drop(context_lock);
                }
            }

            // Send done signal
            let sse_done = format!(
                "data: {}\n\n",
                serde_json::to_string(&serde_json::json!({
                    "content": "",
                    "done": true
                }))
                .unwrap_or_default()
            );
            let _ = tx.send(Ok(Bytes::from(sse_done))).await;

            log::info!("=== Stream processing completed ===");
        });

        Ok(ReceiverStream::new(rx))
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
        context: Arc<tokio::sync::RwLock<context_manager::structs::context::ChatContext>>,
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
                ContextState::ExecutingTools => {
                    let _context_lock = context.write().await;
                    debug!("FSM: ExecutingTools");
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
                    context_lock.add_message_to_branch("main", assistant_message);
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
                ContextState::AwaitingToolApproval => {
                    debug!("FSM: AwaitingToolApproval");

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
        context: &Arc<tokio::sync::RwLock<context_manager::structs::context::ChatContext>>,
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
