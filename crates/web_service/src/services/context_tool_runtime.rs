use std::sync::Arc;

use async_trait::async_trait;
use context_manager::{ApprovalRequestInfo, ToolRuntime, ToolRuntimeAction};
use serde_json::Value;
use tool_system::{types::ToolArguments, ToolExecutor};
use uuid::Uuid;

use super::agent_service::ToolCall as AgentToolCall;
use super::approval_manager::ApprovalManager;

#[derive(Clone)]
pub struct ContextToolRuntime {
    tool_executor: Arc<ToolExecutor>,
    approval_manager: Arc<ApprovalManager>,
}

impl ContextToolRuntime {
    pub fn new(tool_executor: Arc<ToolExecutor>, approval_manager: Arc<ApprovalManager>) -> Self {
        Self {
            tool_executor,
            approval_manager,
        }
    }
}

#[async_trait]
impl ToolRuntime for ContextToolRuntime {
    async fn execute_tool(
        &self,
        _context_id: Uuid,
        tool_name: &str,
        arguments: Value,
        approved_request: Option<Uuid>,
    ) -> Result<Value, ToolRuntimeAction> {
        if approved_request.is_none() {
            if let Some(definition) = self.tool_executor.get_tool_definition(tool_name) {
                if definition.requires_approval {
                    return Err(ToolRuntimeAction::NeedsApproval);
                }
            }
        }

        self.tool_executor
            .execute_tool(tool_name, ToolArguments::Json(arguments))
            .await
            .map_err(|e| ToolRuntimeAction::ExecutionFailed(e.to_string()))
    }

    async fn request_approval(
        &self,
        context_id: Uuid,
        tool_name: &str,
        arguments: Value,
        terminate: bool,
    ) -> Result<ApprovalRequestInfo, ToolRuntimeAction> {
        let description = self
            .tool_executor
            .get_tool_definition(tool_name)
            .map(|def| def.description)
            .unwrap_or_default();

        let tool_call = AgentToolCall {
            tool: tool_name.to_string(),
            parameters: arguments.clone(),
            terminate,
        };

        self.approval_manager
            .create_request(
                context_id,
                tool_call,
                tool_name.to_string(),
                description.clone(),
            )
            .await
            .map(|request_id| ApprovalRequestInfo {
                request_id,
                tool_name: tool_name.to_string(),
                description: Some(description),
                payload: arguments,
            })
            .map_err(|e| ToolRuntimeAction::BackendError(e.to_string()))
    }

    async fn notify_completion(
        &self,
        _context_id: Uuid,
        _tool_name: &str,
        _success: bool,
    ) -> Result<(), ToolRuntimeAction> {
        Ok(())
    }
}
