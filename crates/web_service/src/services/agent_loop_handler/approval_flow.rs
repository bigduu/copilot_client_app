//! Approval flow phase - Tool approval and agent loop resumption

use crate::{
    error::AppError,
    models::ServiceResponse,
    services::{
        agent_loop_runner::AgentLoopRunner, approval_manager::ApprovalManager,
        session_manager::ChatSessionManager, AgentService,
    },
    storage::StorageProvider,
};
use copilot_client::CopilotClientTrait;
use log::info;
use std::sync::Arc;
use tool_system::ToolExecutor;
use uuid::Uuid;

use super::super::llm_request_builder::LlmRequestBuilder;

/// Continue agent loop after approval
pub(super) async fn continue_agent_loop_after_approval<T: StorageProvider>(
    session_manager: &Arc<ChatSessionManager<T>>,
    approval_manager: &Arc<ApprovalManager>,
    tool_executor: &Arc<ToolExecutor>,
    agent_service: &Arc<AgentService>,
    copilot_client: &Arc<dyn CopilotClientTrait>,
    llm_request_builder: LlmRequestBuilder,
    conversation_id: Uuid,
    request_id: Uuid,
    approved: bool,
    reason: Option<String>,
) -> Result<ServiceResponse, AppError> {
    info!(
        "Continuing agent loop after approval: request_id={}, approved={}",
        request_id, approved
    );

    // Get and process the approval request
    let tool_call = approval_manager
        .approve_request(&request_id, approved, reason)
        .await?;

    if !approved {
        info!("Tool call rejected by user");
        return Ok(ServiceResponse::FinalMessage(
            "Tool call was rejected by the user.".to_string(),
        ));
    }

    let tool_call = tool_call.ok_or_else(|| {
        AppError::InternalError(anyhow::anyhow!("No tool call in approved request"))
    })?;

    // Load context
    let context = session_manager
        .load_context(conversation_id, None)
        .await?
        .ok_or_else(|| AppError::NotFound("Session".to_string()))?;

    // Create agent loop runner
    let runner = AgentLoopRunner::new(
        session_manager.clone(),
        conversation_id,
        tool_executor.clone(),
        approval_manager.clone(),
        agent_service.clone(),
        copilot_client.clone(),
        llm_request_builder,
    );

    // Continue the agent loop with the approved tool call
    let llm_response = format!("Approved tool call: {}", tool_call.tool);
    runner
        .resume_after_approval(context, tool_call, &llm_response, request_id)
        .await
}

/// Approve tool calls and execute them
///
/// This function:
/// 1. Finds the pending tool calls in the last assistant message
/// 2. Executes each approved tool
/// 3. Adds tool result messages to the conversation
/// 4. Updates the approval status to Approved
pub(super) async fn approve_tool_calls<T: StorageProvider>(
    session_manager: &Arc<ChatSessionManager<T>>,
    tool_executor: &Arc<ToolExecutor>,
    conversation_id: Uuid,
    approved_tool_calls: Vec<String>,
) -> Result<ServiceResponse, AppError> {
    info!(
        "Approving and executing tool calls: {:?}",
        approved_tool_calls
    );

    let context = session_manager
        .load_context(conversation_id, None)
        .await?
        .ok_or_else(|| AppError::NotFound("Session".to_string()))?;

    // Find tool calls to execute from ANY message in the branch (not just the last)
    let tool_calls_to_execute = {
        let ctx = context.read().await;
        let branch = ctx
            .get_active_branch()
            .ok_or_else(|| AppError::InternalError(anyhow::anyhow!("No active branch")))?;

        info!(
            "Searching for tool calls in {} messages. Looking for IDs: {:?}",
            branch.message_ids.len(),
            approved_tool_calls
        );

        let mut found_tool_calls = Vec::new();

        // Search through ALL messages in the branch for matching tool calls
        for message_id in branch.message_ids.iter().rev() {
            if let Some(node) = ctx.message_pool.get(message_id) {
                if let Some(tool_calls) = &node.message.tool_calls {
                    info!(
                        "  Message {} has {} tool calls: {:?}",
                        message_id,
                        tool_calls.len(),
                        tool_calls.iter().map(|tc| &tc.id).collect::<Vec<_>>()
                    );

                    for tc in tool_calls {
                        if approved_tool_calls.contains(&tc.id) {
                            info!("    Found matching tool call: {}", tc.id);
                            found_tool_calls.push(tc.clone());
                        }
                    }
                }
            }
        }

        found_tool_calls
    };

    if tool_calls_to_execute.is_empty() {
        return Err(AppError::InternalError(anyhow::anyhow!(
            "No matching tool calls found for approval. Requested IDs: {:?}",
            approved_tool_calls
        )));
    }

    info!(
        "Found {} tool calls to execute",
        tool_calls_to_execute.len()
    );

    // Execute each tool and add results
    for tool_call in tool_calls_to_execute {
        info!(
            "Executing tool: {} (id: {})",
            tool_call.tool_name, tool_call.id
        );

        // Convert arguments to the format expected by ToolExecutor
        let args = match &tool_call.arguments {
            tool_system::types::ToolArguments::Json(json) => json.clone(),
            tool_system::types::ToolArguments::String(s) => serde_json::Value::String(s.clone()),
            tool_system::types::ToolArguments::StringList(list) => {
                serde_json::to_value(list).unwrap_or(serde_json::Value::Null)
            }
        };

        // Execute the tool
        let result = tool_executor
            .execute_tool(
                &tool_call.tool_name,
                tool_system::types::ToolArguments::Json(args),
            )
            .await;

        let result_value = match result {
            Ok(value) => value,
            Err(e) => {
                log::error!("Tool execution failed: {}", e);
                serde_json::json!({ "error": format!("Tool execution failed: {}", e) })
            }
        };

        info!("Tool result for {}: {:?}", tool_call.id, result_value);

        // Add tool result message to context
        {
            let mut ctx = context.write().await;

            // Create tool result message
            let tool_result_message = context_manager::InternalMessage {
                role: context_manager::Role::Tool,
                content: vec![context_manager::ContentPart::text_owned(
                    result_value.to_string(),
                )],
                tool_result: Some(context_manager::structs::tool::ToolCallResult {
                    request_id: tool_call.id.clone(),
                    result: result_value.clone(),
                    display_preference: context_manager::DisplayPreference::Default,
                }),
                message_type: context_manager::MessageType::ToolResult,
                ..Default::default()
            };

            ctx.add_message_to_branch("main", tool_result_message);
            ctx.mark_dirty();
        }

        // Update approval status
        {
            let mut ctx = context.write().await;

            // Collect message IDs first to avoid borrow issues
            let message_ids: Vec<Uuid> = ctx
                .get_active_branch()
                .map(|b| b.message_ids.clone())
                .unwrap_or_default();

            // Find the assistant message with tool calls and update status
            for message_id in message_ids.iter().rev() {
                if let Some(node) = ctx.message_pool.get_mut(message_id) {
                    if let Some(tool_calls) = &mut node.message.tool_calls {
                        for tc in tool_calls.iter_mut() {
                            if tc.id == tool_call.id {
                                tc.approval_status =
                                    context_manager::structs::tool::ApprovalStatus::Approved;
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    session_manager.auto_save_if_dirty(&context).await?;

    info!("All approved tool calls executed successfully");
    Ok(ServiceResponse::FinalMessage(
        "Tool calls executed successfully".to_string(),
    ))
}
