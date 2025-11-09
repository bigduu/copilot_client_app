use async_trait::async_trait;
use serde_json::Value;
use uuid::Uuid;

/// Information about an approval request emitted by the runtime.
#[derive(Debug, Clone)]
pub struct ApprovalRequestInfo {
    pub request_id: Uuid,
    pub tool_name: String,
    pub description: Option<String>,
    pub payload: Value,
}

#[async_trait]
pub trait ToolRuntime: Send + Sync {
    async fn execute_tool(
        &self,
        context_id: Uuid,
        tool_name: &str,
        arguments: Value,
        approved_request: Option<Uuid>,
    ) -> Result<Value, ToolRuntimeAction>;

    async fn request_approval(
        &self,
        context_id: Uuid,
        tool_name: &str,
        arguments: Value,
        terminate: bool,
    ) -> Result<ApprovalRequestInfo, ToolRuntimeAction>;

    async fn notify_completion(
        &self,
        context_id: Uuid,
        tool_name: &str,
        success: bool,
    ) -> Result<(), ToolRuntimeAction>;
}

#[derive(Debug)]
pub enum ToolRuntimeAction {
    NeedsApproval,
    ExecutionFailed(String),
    BackendError(String),
}
