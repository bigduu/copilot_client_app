use std::sync::Arc;

use context_manager::{ChatContext, ChatEvent, ContentPart, InternalMessage, Role};
use tokio::sync::RwLock;
use tokio::time;
use uuid::Uuid;

use crate::error::AppError;
use crate::services::agent_service::{AgentLoopState, AgentService, ToolCall as AgentToolCall};
use crate::services::approval_manager::ApprovalManager;
use crate::services::llm_request_builder::LlmRequestBuilder;
use crate::services::llm_utils::detect_message_type;
use crate::services::session_manager::ChatSessionManager;
use crate::storage::StorageProvider;

use tool_system::{types::ToolArguments, ToolExecutor};

use copilot_client::api::models::{ChatCompletionResponse, Content as ClientContent};
use copilot_client::CopilotClientTrait;

use super::chat_service::ServiceResponse;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ApprovalPolicy {
    RequireCheckForEachTool,
    SkipChecks,
}

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

    fn approval_policy(&self) -> ApprovalPolicy {
        match self {
            AgentLoopOrigin::StreamingResponse { .. } => ApprovalPolicy::RequireCheckForEachTool,
            AgentLoopOrigin::ApprovedContinuation { .. } => ApprovalPolicy::SkipChecks,
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
        Self {
            session_manager,
            conversation_id,
            tool_executor,
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
        let approval_policy = origin.approval_policy();
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
            let tool_definition = self.tool_executor.get_tool_definition(&tool_name);

            if let Some(def) = &tool_definition {
                if def.requires_approval {
                    match approval_policy {
                        ApprovalPolicy::RequireCheckForEachTool => {
                            let request_id = self
                                .approval_manager
                                .create_request(
                                    self.conversation_id,
                                    current_tool_call.clone(),
                                    tool_name.clone(),
                                    def.description.clone(),
                                )
                                .await?;

                            {
                                let mut context_lock = context.write().await;
                                let _ = context_lock
                                    .record_tool_approval_request(request_id, &tool_name);
                            }

                            return Ok(ServiceResponse::AwaitingAgentApproval {
                                request_id,
                                session_id: self.conversation_id,
                                tool_name: tool_name.clone(),
                                tool_description: def.description.clone(),
                                parameters: current_tool_call.parameters.clone(),
                            });
                        }
                        ApprovalPolicy::SkipChecks => {
                            log::debug!(
                                "Approval already granted for tool '{}', skipping approval check",
                                tool_name
                            );
                        }
                    }
                }
            }

            let attempt_usize = agent_state.tool_execution_failures.saturating_add(1);
            let attempt = attempt_usize.min(u8::MAX as usize) as u8;
            let exec_request_id = approval_request_id.take();
            {
                let mut context_lock = context.write().await;
                let _ = context_lock.begin_tool_execution(&tool_name, attempt, exec_request_id);
            }

            let tool_result = {
                log::info!(
                    "Executing tool '{}' with parameters: {:?}",
                    tool_name,
                    current_tool_call.parameters
                );

                let execution_future = self.tool_executor.execute_tool(
                    &tool_name,
                    ToolArguments::Json(current_tool_call.parameters.clone()),
                );

                let timeout_duration = self.agent_service.tool_execution_timeout();

                match time::timeout(timeout_duration, execution_future).await {
                    Ok(Ok(result)) => {
                        log::info!("Tool '{}' executed successfully", tool_name);
                        agent_state.reset_tool_failures();
                        result
                    }
                    Ok(Err(e)) => {
                        let error_msg = e.to_string();
                        log::error!("Tool '{}' execution failed: {}", tool_name, error_msg);

                        agent_state.record_tool_failure(&tool_name);
                        let retry_count =
                            attempt_usize.saturating_sub(1).min(u8::MAX as usize) as u8;

                        let error_feedback = self
                            .agent_service
                            .create_tool_error_feedback(&tool_name, &error_msg);

                        {
                            let mut context_lock = context.write().await;
                            let error_message = InternalMessage {
                                role: Role::Tool,
                                content: vec![ContentPart::Text {
                                    text: error_feedback.clone(),
                                }],
                                ..Default::default()
                            };
                            let _ = context_lock.add_message_to_branch("main", error_message);
                            let _ = context_lock.record_tool_execution_failure(
                                &tool_name,
                                retry_count,
                                &error_msg,
                                exec_request_id,
                            );
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
                    Err(_) => {
                        log::error!(
                            "Tool '{}' execution timed out after {:?}",
                            tool_name,
                            timeout_duration
                        );

                        agent_state.record_tool_failure(&tool_name);
                        let retry_count =
                            attempt_usize.saturating_sub(1).min(u8::MAX as usize) as u8;

                        let timeout_msg =
                            format!("Tool execution timed out after {:?}", timeout_duration);
                        let error_feedback = self
                            .agent_service
                            .create_tool_error_feedback(&tool_name, &timeout_msg);

                        {
                            let mut context_lock = context.write().await;
                            let timeout_message = InternalMessage {
                                role: Role::Tool,
                                content: vec![ContentPart::Text {
                                    text: error_feedback.clone(),
                                }],
                                ..Default::default()
                            };
                            let _ = context_lock.add_message_to_branch("main", timeout_message);
                            let _ = context_lock.record_tool_execution_failure(
                                &tool_name,
                                retry_count,
                                &timeout_msg,
                                exec_request_id,
                            );
                        }

                        if !self.agent_service.should_continue(&agent_state)? {
                            log::error!("Agent loop stopping after tool timeout failures");
                            return Ok(ServiceResponse::FinalMessage(format!(
                                "Tool execution timed out after {} retries",
                                agent_state.tool_execution_failures
                            )));
                        }

                        continue;
                    }
                }
            };

            let tool_result_str = tool_result.to_string();

            {
                let mut context_lock = context.write().await;
                let tool_result_message = InternalMessage {
                    role: Role::Tool,
                    content: vec![ContentPart::Text {
                        text: tool_result_str.clone(),
                    }],
                    ..Default::default()
                };
                let _ = context_lock.add_message_to_branch("main", tool_result_message);
                let _ = context_lock.complete_tool_execution();
            }

            agent_state
                .tool_call_history
                .push(super::agent_service::ToolCallRecord {
                    tool_name: tool_name.clone(),
                    parameters: current_tool_call.parameters.clone(),
                    result: Some(serde_json::json!({ "result": tool_result_str })),
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

                self.auto_save_context(&context).await?;
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

                self.auto_save_context(&context).await?;
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
        self.auto_save_context(&context).await?;
        Ok(ServiceResponse::FinalMessage(final_message))
    }

    async fn auto_save_context(&self, context: &Arc<RwLock<ChatContext>>) -> Result<(), AppError> {
        self.session_manager
            .save_context(&mut *context.write().await)
            .await
            .map_err(|e| AppError::InternalError(anyhow::anyhow!(e.to_string())))
    }
}
