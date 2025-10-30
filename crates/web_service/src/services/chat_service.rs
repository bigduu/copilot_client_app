use crate::{error::AppError, storage::StorageProvider};
use context_manager::{
    structs::{
        message::{ContentPart, InternalMessage, Role},
        state::ContextState,
        tool::ToolCallRequest,
    },
    ChatEvent,
};
use copilot_client::CopilotClientTrait;
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

pub struct ChatService<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Arc<dyn CopilotClientTrait>,
    tool_executor: Arc<ToolExecutor>,
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
        let context = self
            .session_manager
            .load_context(self.conversation_id)
            .await?
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("Session not found")))?;
        let mut context_lock = context.lock().await;

        let user_message = InternalMessage {
            role: Role::User,
            content: vec![ContentPart::Text(message)],
            ..Default::default()
        };
        context_lock.add_message_to_branch("main", user_message);
        // context_lock.handle_event(ChatEvent::UserMessageSent);

        drop(context_lock);

        self.run_fsm(context).await
    }

    pub async fn approve_tool_calls(
        &mut self,
        approved_tool_calls: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        let context = self
            .session_manager
            .load_context(self.conversation_id)
            .await?
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("Session not found")))?;
        let mut context_lock = context.lock().await;

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
        loop {
            let current_state = {
                let context_lock = context.lock().await;
                context_lock.current_state.clone()
            };

            match current_state {
                ContextState::ProcessingUserMessage => {
                    let mut context_lock = context.lock().await;
                    // Placeholder for calling LLM
                    println!("FSM: ProcessingUserMessage -> Calling LLM");
                    // In a real scenario, you would adapt the context and call the LLM client
                    // For now, we'll just create a mock assistant response.
                    let assistant_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text("This is a mock response.".to_string())],
                        ..Default::default()
                    };
                    context_lock.add_message_to_branch("main", assistant_message);
                    // context_lock.handle_event(ChatEvent::LLMFullResponseReceived);
                }
                ContextState::ProcessingLLMResponse => {
                    let mut context_lock = context.lock().await;
                    println!("FSM: ProcessingLLMResponse");
                    let has_tool_calls = context_lock
                        .get_active_branch()
                        .and_then(|b| b.message_ids.last())
                        .and_then(|id| context_lock.message_pool.get(id))
                        .map_or(false, |node| node.message.tool_calls.is_some());

                    // context_lock.handle_event(ChatEvent::LLMResponseProcessed { has_tool_calls });
                }
                ContextState::ExecutingTools => {
                    let mut context_lock = context.lock().await;
                    println!("FSM: ExecutingTools");
                    // Placeholder for executing tools
                    // context_lock.handle_event(ChatEvent::ToolExecutionCompleted);
                }
                ContextState::ProcessingToolResults => {
                    let mut context_lock = context.lock().await;
                    println!("FSM: ProcessingToolResults");
                    // Placeholder for adding tool results
                    // context_lock.handle_event(ChatEvent::LLMRequestInitiated);
                }
                ContextState::GeneratingResponse => {
                    let mut context_lock = context.lock().await;
                    println!("FSM: GeneratingResponse -> Calling LLM again");
                    // Placeholder for calling LLM
                    let assistant_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text(
                            "This is a mock response after tool execution.".to_string(),
                        )],
                        ..Default::default()
                    };
                    context_lock.add_message_to_branch("main", assistant_message);
                    // context_lock.handle_event(ChatEvent::LLMFullResponseReceived);
                }
                ContextState::Idle => {
                    println!("FSM: Idle");
                    let context_lock = context.lock().await;
                    let final_content = context_lock
                        .get_active_branch()
                        .and_then(|b| b.message_ids.last())
                        .and_then(|id| context_lock.message_pool.get(id))
                        .and_then(|node| node.message.content.first())
                        .and_then(|part| part.text_content())
                        .unwrap_or_default()
                        .to_string();
                    return Ok(ServiceResponse::FinalMessage(final_content));
                }
                ContextState::AwaitingToolApproval => {
                    println!("FSM: AwaitingToolApproval");
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
                    println!("FSM: Failed");
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
}
