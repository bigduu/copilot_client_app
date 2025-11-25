use std::sync::Arc;

use context_manager::{ChatContext, ChatEvent, ContentPart, InternalMessage, Role};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::error::AppError;
use crate::services::agent_service::{AgentLoopState, AgentService, ToolCall as AgentToolCall};
use crate::services::approval_manager::ApprovalManager;
use crate::services::llm_request_builder::LlmRequestBuilder;
use crate::services::llm_utils::detect_message_type;
use crate::services::session_manager::ChatSessionManager;
use crate::storage::StorageProvider;

use tool_system::ToolExecutor;

use copilot_client::api::models::{ChatCompletionResponse, Content as ClientContent};
use copilot_client::CopilotClientTrait;

use super::chat_service::ServiceResponse;

enum AgentLoopOrigin {
    StreamingResponse { llm_response: String },
    ApprovedContinuation { llm_response: String },
}

impl AgentLoopOrigin {
    fn response_text(&self) -> &str {
        match self {
            AgentLoopOrigin::StreamingResponse { llm_response }
            | AgentLoopOrigin::ApprovedContinuation { llm_response } => llm_response,
        }
    }
}

struct AgentLoopInvocation {
    tool_call: AgentToolCall,
    origin: AgentLoopOrigin,
    approval_request_id: Option<Uuid>,
}

pub struct AgentLoopRunner<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    tool_executor: Arc<ToolExecutor>,
    tool_coordinator: crate::services::tool_coordinator::ToolCoordinator<T>,
    approval_manager: Arc<ApprovalManager>,
    agent_service: Arc<AgentService>,
    copilot_client: Arc<dyn CopilotClientTrait>,
    request_builder: LlmRequestBuilder,
}

impl<T: StorageProvider> AgentLoopRunner<T> {
    pub fn new(
        session_manager: Arc<ChatSessionManager<T>>,
        conversation_id: Uuid,
        tool_executor: Arc<ToolExecutor>,
        approval_manager: Arc<ApprovalManager>,
        agent_service: Arc<AgentService>,
        copilot_client: Arc<dyn CopilotClientTrait>,
        request_builder: LlmRequestBuilder,
    ) -> Self {
        let tool_coordinator = crate::services::tool_coordinator::ToolCoordinator::new(
            tool_executor.clone(),
            approval_manager.clone(),
            session_manager.clone(),
        );
        Self {
            session_manager,
            conversation_id,
            tool_executor,
            tool_coordinator,
            approval_manager,
            agent_service,
            copilot_client,
            request_builder,
        }
    }

    pub async fn start(
        &self,
        context: Arc<RwLock<ChatContext>>,
        tool_call: AgentToolCall,
        llm_response: &str,
    ) -> Result<ServiceResponse, AppError> {
        let invocation = AgentLoopInvocation {
            tool_call,
            origin: AgentLoopOrigin::StreamingResponse {
                llm_response: llm_response.to_string(),
            },
            approval_request_id: None,
        };
        self.run_invocation(context, invocation).await
    }

    pub async fn resume_after_approval(
        &self,
        context: Arc<RwLock<ChatContext>>,
        tool_call: AgentToolCall,
        llm_response: &str,
        approval_request_id: Uuid,
    ) -> Result<ServiceResponse, AppError> {
        let invocation = AgentLoopInvocation {
            tool_call,
            origin: AgentLoopOrigin::ApprovedContinuation {
                llm_response: llm_response.to_string(),
            },
            approval_request_id: Some(approval_request_id),
        };
        self.run_invocation(context, invocation).await
    }

    async fn run_invocation(
        &self,
        context: Arc<RwLock<ChatContext>>,
        invocation: AgentLoopInvocation,
    ) -> Result<ServiceResponse, AppError> {
        let AgentLoopInvocation {
            tool_call,
            origin,
            approval_request_id,
        } = invocation;
        let mut accumulated_response = origin.response_text().to_string();
        let mut approval_request_id = approval_request_id;

        let mut agent_state = AgentLoopState::new();
        let mut current_tool_call = tool_call;

        loop {
            agent_state.iteration += 1;

            if !self.agent_service.should_continue(&agent_state)? {
                log::warn!("Agent loop stopped: iteration limit or timeout reached");
                break;
            }

            let tool_name = current_tool_call.tool.clone();
            let approved_request = approval_request_id.take();

            let options = crate::services::tool_coordinator::ToolExecutionOptions {
                request_id: approved_request,
                terminate: current_tool_call.terminate,
                display_preference: None,
            };

            let execution_updates = self
                .tool_coordinator
                .execute_tool(
                    &context,
                    tool_name.clone(),
                    current_tool_call.parameters.clone(),
                    options,
                )
                .await?;

            let mut approval_info: Option<(Uuid, String, serde_json::Value)> = None;
            let mut failure_error: Option<String> = None;
            let mut success_payload: Option<serde_json::Value> = None;

            for update in &execution_updates {
                if let Some(event) = update
                    .metadata
                    .get("tool_event")
                    .and_then(|value| value.as_str())
                {
                    match event {
                        "approval_requested" => {
                            if let Some(request_id) = update
                                .metadata
                                .get("request_id")
                                .and_then(|value| value.as_str())
                                .and_then(|value| Uuid::parse_str(value).ok())
                            {
                                let description = update
                                    .metadata
                                    .get("tool_description")
                                    .and_then(|value| value.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_default();

                                let parameters = update
                                    .metadata
                                    .get("parameters")
                                    .cloned()
                                    .unwrap_or_else(|| current_tool_call.parameters.clone());

                                approval_info = Some((request_id, description, parameters));
                            }
                        }
                        "execution_failed" => {
                            failure_error = update
                                .metadata
                                .get("error")
                                .and_then(|value| value.as_str())
                                .map(|s| s.to_string());
                        }
                        "execution_completed" => {
                            success_payload = update.metadata.get("result").cloned();
                        }
                        _ => {}
                    }
                }
            }

            if let Some((request_id, description, _parameters)) = approval_info {
                return Ok(ServiceResponse::AwaitingAgentApproval {
                    request_id,
                    context_id: self.conversation_id,
                    reason: format!(
                        "Agent-initiated tool call '{}' requires approval: {}",
                        tool_name, description
                    ),
                });
            }

            if let Some(error_msg) = failure_error {
                agent_state.record_tool_failure(&tool_name);

                if let Some(pending_request) = approved_request {
                    approval_request_id = Some(pending_request);
                }

                if !self.agent_service.should_continue(&agent_state)? {
                    log::error!("Agent loop stopping after tool execution failures");
                    return Ok(ServiceResponse::FinalMessage(format!(
                        "Tool execution failed after {} retries: {}",
                        agent_state.tool_execution_failures, error_msg
                    )));
                }

                continue;
            }

            agent_state.reset_tool_failures();

            let tool_result_value = success_payload.unwrap_or(serde_json::Value::Null);

            agent_state
                .tool_call_history
                .push(super::agent_service::ToolCallRecord {
                    tool_name: tool_name.clone(),
                    parameters: current_tool_call.parameters.clone(),
                    result: Some(tool_result_value.clone()),
                    terminate: current_tool_call.terminate,
                });

            if current_tool_call.terminate {
                let final_message = if accumulated_response.is_empty() {
                    format!("Tool '{}' completed successfully.", tool_name)
                } else {
                    accumulated_response.clone()
                };
                let message_type = detect_message_type(&final_message);

                {
                    let mut context_lock = context.write().await;
                    let final_assistant_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text {
                            text: final_message.clone(),
                        }],
                        message_type,
                        ..Default::default()
                    };
                    let _ = context_lock.add_message_to_branch("main", final_assistant_message);
                    context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                        has_tool_calls: false,
                    });
                }

                self.session_manager.auto_save_if_dirty(&context).await?;
                return Ok(ServiceResponse::FinalMessage(final_message));
            }

            let llm_request = self.request_builder.build(&context).await?;
            let mut request = llm_request.request.clone();
            request.stream = Some(false);

            let response = self
                .copilot_client
                .send_chat_completion_request(request)
                .await
                .map_err(|e| {
                    AppError::InternalError(anyhow::anyhow!("LLM call failed in loop: {}", e))
                })?;

            if !response.status().is_success() {
                let error_msg = format!("LLM API error in loop. Status: {}", response.status());
                return Err(AppError::InternalError(anyhow::anyhow!(error_msg)));
            }

            let response_text = {
                let body_bytes = response.bytes().await.map_err(|e| {
                    AppError::InternalError(anyhow::anyhow!("Failed to read response body: {}", e))
                })?;

                let response_json: ChatCompletionResponse = serde_json::from_slice(&body_bytes)
                    .map_err(|e| {
                        AppError::InternalError(anyhow::anyhow!(
                            "Failed to parse response JSON: {}",
                            e
                        ))
                    })?;

                response_json
                    .choices
                    .first()
                    .and_then(|choice| match &choice.message.content {
                        ClientContent::Text(text) => Some(text.clone()),
                        _ => None,
                    })
                    .ok_or_else(|| {
                        AppError::InternalError(anyhow::anyhow!("No content in LLM response"))
                    })?
            };

            accumulated_response = response_text.clone();

            let next_tool_call_opt = self
                .agent_service
                .parse_tool_call_from_response(&response_text)
                .map_err(|e| {
                    AppError::InternalError(anyhow::anyhow!("Failed to parse tool call: {}", e))
                })?;

            if let Some(next_tool_call) = next_tool_call_opt {
                self.agent_service
                    .validate_tool_call(&next_tool_call)
                    .map_err(|e| {
                        AppError::InternalError(anyhow::anyhow!("Invalid tool call: {}", e))
                    })?;

                current_tool_call = next_tool_call;
            } else {
                let message_type = detect_message_type(&response_text);
                {
                    let mut context_lock = context.write().await;
                    let final_assistant_message = InternalMessage {
                        role: Role::Assistant,
                        content: vec![ContentPart::Text {
                            text: response_text.clone(),
                        }],
                        message_type,
                        ..Default::default()
                    };
                    let _ = context_lock.add_message_to_branch("main", final_assistant_message);
                    context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                        has_tool_calls: false,
                    });
                }

                self.session_manager.auto_save_if_dirty(&context).await?;
                return Ok(ServiceResponse::FinalMessage(response_text));
            }
        }

        let final_message = format!(
            "Agent loop completed after {} iterations",
            agent_state.iteration
        );
        let message_type = detect_message_type(&final_message);
        {
            let mut context_lock = context.write().await;
            let final_assistant_message = InternalMessage {
                role: Role::Assistant,
                content: vec![ContentPart::Text {
                    text: final_message.clone(),
                }],
                message_type,
                ..Default::default()
            };
            let _ = context_lock.add_message_to_branch("main", final_assistant_message);
            context_lock.handle_event(ChatEvent::LLMResponseProcessed {
                has_tool_calls: false,
            });
        }
        self.session_manager.auto_save_if_dirty(&context).await?;
        Ok(ServiceResponse::FinalMessage(final_message))
    }
}
