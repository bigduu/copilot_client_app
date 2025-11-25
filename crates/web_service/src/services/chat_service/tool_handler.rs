//! Tool Handler - 工具处理域
//!
//! 负责工具审批、执行和 Agent Loop 管理

use crate::{
    error::AppError, models::ServiceResponse, services::agent_loop_handler::AgentLoopHandler,
    storage::StorageProvider,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// 工具处理 Handler
///
/// 负责处理：
/// - 工具审批流程
/// - Agent Loop 继续
/// - 工具调用管理
pub struct ToolHandler<T: StorageProvider> {
    agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>,
}

impl<T: StorageProvider + 'static> ToolHandler<T> {
    /// 创建新的 ToolHandler
    pub fn new(agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>) -> Self {
        Self { agent_loop_handler }
    }

    /// 审批工具调用
    pub async fn approve_tools(
        &self,
        conversation_id: Uuid,
        approved_tools: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        // 委托给 AgentLoopHandler
        // TODO: 未来可以添加审批前的验证、策略检查等
        self.agent_loop_handler
            .write()
            .await
            .approve_tool_calls(conversation_id, approved_tools)
            .await
    }

    /// 继续 Agent Loop（审批后）
    pub async fn continue_after_approval(
        &self,
        conversation_id: Uuid,
        request_id: Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse, AppError> {
        // 委托给 AgentLoopHandler
        // TODO: 未来可以添加审批后的额外处理逻辑
        self.agent_loop_handler
            .write()
            .await
            .continue_agent_loop_after_approval(conversation_id, request_id, approved, reason)
            .await
    }
}
