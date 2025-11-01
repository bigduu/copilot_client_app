use crate::{error::AppError, storage::StorageProvider};
use context_manager::structs::{
    message::{ContentPart, InternalMessage, Role},
    state::ContextState,
    tool::ToolCallRequest,
};
use copilot_client::api::models::{ChatCompletionRequest, ChatMessage, Content, Role as ClientRole};
use copilot_client::CopilotClientTrait;
use log::{debug, error, info};
use serde::Serialize;
use std::sync::Arc;
use tool_system::ToolExecutor;
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
            ContentPart::Text { text } => Some(copilot_client::api::models::ContentPart::Text { 
                text: text.clone() 
            }),
            ContentPart::Image { url, detail } => Some(copilot_client::api::models::ContentPart::ImageUrl {
                image_url: copilot_client::api::models::ImageUrl {
                    url: url.clone(),
                    detail: detail.clone(),
                },
            }),
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

impl<T: StorageProvider> ChatService<T> {
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
            .load_context(self.conversation_id)
            .await?
            .ok_or_else(|| {
                log::error!("Session not found: {}", self.conversation_id);
                AppError::InternalError(anyhow::anyhow!("Session not found"))
            })?;
        
        log::info!("Context loaded successfully");
        
        let mut context_lock = context.lock().await;
        log::info!("Current context state before adding message: {:?}", context_lock.current_state);
        log::info!("Message pool size: {}", context_lock.message_pool.len());

        let user_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::Text { text: message.clone() }],
            ..Default::default()
        };
        context_lock.add_message_to_branch("main", user_message);
        log::info!("User message added to branch 'main'");
        log::info!("Message pool size after add: {}", context_lock.message_pool.len());
        
        // Transition state to ProcessingUserMessage so FSM will process it
        context_lock.current_state = ContextState::ProcessingUserMessage;
        log::info!("State transitioned: Idle -> ProcessingUserMessage");

        drop(context_lock);

        // Auto-save after adding user message
        log::info!("Auto-saving context after adding user message");
        self.auto_save_context(&context).await?;
        log::info!("Context auto-saved successfully");

        log::info!("Starting FSM run");
        let result = self.run_fsm(context).await;
        
        match &result {
            Ok(response) => log::info!("FSM completed successfully: {:?}", response),
            Err(e) => log::error!("FSM failed with error: {:?}", e),
        }
        
        log::info!("=== ChatService::process_message END ===");
        result
    }

    pub async fn approve_tool_calls(
        &mut self,
        _approved_tool_calls: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        let context = self
            .session_manager
            .load_context(self.conversation_id)
            .await?
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("Session not found")))?;
        let context_lock = context.lock().await;

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
        context: Arc<tokio::sync::Mutex<context_manager::structs::context::ChatContext>>,
    ) -> Result<ServiceResponse, AppError> {
        log::info!("=== FSM Loop Starting ===");
        let mut iteration_count = 0;
        
        loop {
            iteration_count += 1;
            log::info!("FSM iteration #{}", iteration_count);
            
            let current_state = {
                let context_lock = context.lock().await;
                context_lock.current_state.clone()
            };
            
            log::info!("Current FSM state: {:?}", current_state);

            match current_state {
                ContextState::ProcessingUserMessage => {
                    log::info!("FSM: Entered ProcessingUserMessage state");
                    
                    // Extract messages and config from context
                    let (model_id, messages) = {
                        let ctx = context.lock().await;
                        let msgs: Vec<InternalMessage> = ctx
                            .get_active_branch()
                            .map(|branch| {
                                branch
                                    .message_ids
                                    .iter()
                                    .filter_map(|id| ctx.message_pool.get(id))
                                    .map(|node| node.message.clone())
                                    .collect()
                            })
                            .unwrap_or_default();
                        (ctx.config.model_id.clone(), msgs)
                    };
                    
                    log::info!("Calling real LLM with {} messages, model: {}", messages.len(), model_id);
                    
                    // Convert to LLM client format
                    let chat_messages: Vec<ChatMessage> = messages
                        .iter()
                        .map(convert_to_chat_message)
                        .collect();
                    
                    // Build request
                    let request = ChatCompletionRequest {
                        model: model_id,
                        messages: chat_messages,
                        stream: Some(false), // Non-streaming for now
                        tools: None,
                        tool_choice: None,
                        ..Default::default()
                    };
                    
                    // Call the real LLM
                    match self.copilot_client.send_chat_completion_request(request).await {
                        Ok(response) => {
                            let status = response.status();
                            
                            match response.bytes().await {
                                Ok(body) => {
                                    if !status.is_success() {
                                        let error_msg = format!(
                                            "LLM API error. Status: {}, Body: {}",
                                            status,
                                            String::from_utf8_lossy(&body)
                                        );
                                        error!("{}", error_msg);
                                        
                                        // Add error message to context
                                        let mut context_lock = context.lock().await;
                                        let error_message = InternalMessage {
                                            role: Role::Assistant,
                                            content: vec![ContentPart::Text { 
                                                text: format!("Sorry, I encountered an error: {}", error_msg)
                                            }],
                                            ..Default::default()
                                        };
                                        context_lock.add_message_to_branch("main", error_message);
                                        context_lock.current_state = ContextState::Idle;
                                        drop(context_lock);
                                        
                                        self.auto_save_context(&context).await?;
                                        return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
                                    }
                                    
                                    // Parse response
                                    match serde_json::from_slice::<serde_json::Value>(&body) {
                                        Ok(json) => {
                                            let assistant_text = json["choices"][0]["message"]["content"]
                                                .as_str()
                                                .unwrap_or("(empty response)")
                                                .to_string();
                                            
                                            info!("✅ LLM response received: {} chars", assistant_text.len());
                                            
                                            // Add LLM response to context
                                            let mut context_lock = context.lock().await;
                                            let assistant_message = InternalMessage {
                                                role: Role::Assistant,
                                                content: vec![ContentPart::Text { text: assistant_text }],
                                                ..Default::default()
                                            };
                                            context_lock.add_message_to_branch("main", assistant_message);
                                            log::info!("Assistant message added to branch, message pool size: {}", context_lock.message_pool.len());
                                            
                                            // Transition to Idle state
                                            context_lock.current_state = ContextState::Idle;
                                            log::info!("State transitioned: ProcessingUserMessage -> Idle");
                                            drop(context_lock);
                                            
                                            // Auto-save
                                            log::info!("Auto-saving after ProcessingUserMessage");
                                            self.auto_save_context(&context).await?;
                                            log::info!("Auto-save completed");
                                        }
                                        Err(e) => {
                                            let error_msg = format!("Failed to parse LLM response: {}", e);
                                            error!("{}", error_msg);
                                            
                                            let mut context_lock = context.lock().await;
                                            let error_message = InternalMessage {
                                                role: Role::Assistant,
                                                content: vec![ContentPart::Text { 
                                                    text: format!("Sorry, I couldn't parse the response: {}", e)
                                                }],
                                                ..Default::default()
                                            };
                                            context_lock.add_message_to_branch("main", error_message);
                                            context_lock.current_state = ContextState::Idle;
                                            drop(context_lock);
                                            
                                            self.auto_save_context(&context).await?;
                                            return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
                                        }
                                    }
                                }
                                Err(e) => {
                                    let error_msg = format!("Failed to read LLM response body: {}", e);
                                    error!("{}", error_msg);
                                    return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
                                }
                            }
                        }
                        Err(e) => {
                            let error_msg = format!("LLM call failed: {:?}", e);
                            error!("{}", error_msg);
                            
                            // Add error message to context
                            let mut context_lock = context.lock().await;
                            let error_message = InternalMessage {
                                role: Role::Assistant,
                                content: vec![ContentPart::Text { 
                                    text: format!("Sorry, I couldn't connect to the LLM: {}", e)
                                }],
                                ..Default::default()
                            };
                            context_lock.add_message_to_branch("main", error_message);
                            context_lock.current_state = ContextState::Idle;
                            drop(context_lock);
                            
                            self.auto_save_context(&context).await?;
                            return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
                        }
                    }
                }
                ContextState::ProcessingLLMResponse => {
                    let context_lock = context.lock().await;
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
                    let _context_lock = context.lock().await;
                    debug!("FSM: ExecutingTools");
                    // Placeholder for executing tools
                    // context_lock.handle_event(ChatEvent::ToolExecutionCompleted);
                    drop(_context_lock);
                    
                    // Auto-save after state transition
                    self.auto_save_context(&context).await?;
                }
                ContextState::ProcessingToolResults => {
                    let _context_lock = context.lock().await;
                    debug!("FSM: ProcessingToolResults");
                    // Placeholder for adding tool results
                    // context_lock.handle_event(ChatEvent::LLMRequestInitiated);
                    drop(_context_lock);
                    
                    // Auto-save after state transition
                    self.auto_save_context(&context).await?;
                }
                ContextState::GeneratingResponse => {
                    let mut context_lock = context.lock().await;
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
                    
                    let context_lock = context.lock().await;
                    log::info!("Final message pool size: {}", context_lock.message_pool.len());
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
                    
                    let context_lock = context.lock().await;
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
        context: &Arc<tokio::sync::Mutex<context_manager::structs::context::ChatContext>>,
    ) -> Result<(), AppError> {
        let mut context_lock = context.lock().await;
        self.session_manager.save_context(&mut *context_lock).await?;
        Ok(())
    }
}
