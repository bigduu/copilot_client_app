//! Approval flow phase - Tool approval and agent loop resumption

use crate::{
    error::AppError,
    models::ServiceResponse,
    services::{
        agent_loop_runner::AgentLoopRunner, approval_manager::ApprovalManager,
        session_manager::ChatSessionManager, tool_coordinator::ToolExecutor, AgentService,
    },
    storage::StorageProvider,
};
use copilot_client::CopilotClientTrait;
use log::info;
use std::sync::Arc;
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

/// Approve tool calls (legacy method)
pub(super) async fn approve_tool_calls<T: StorageProvider>(
    session_manager: &Arc<ChatSessionManager<T>>,
    conversation_id: Uuid,
    _approved_tool_calls: Vec<String>,
) -> Result<ServiceResponse, AppError> {
    let context = session_manager
        .load_context(conversation_id, None)
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

    session_manager.auto_save_if_dirty(&context).await?;
    Ok(ServiceResponse::FinalMessage(final_message))
}
