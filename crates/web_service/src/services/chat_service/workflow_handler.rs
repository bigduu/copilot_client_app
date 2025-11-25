//! Workflow Handler - 工作流处理域
//!
//! 负责工作流的执行和管理

use crate::{
    error::AppError,
    models::{SendMessageRequest, ServiceResponse},
    services::agent_loop_handler::AgentLoopHandler,
    storage::StorageProvider,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// 工作流处理 Handler
///
/// 负责处理：
/// - 工作流执行
/// - 工作流状态管理
pub struct WorkflowHandler<T: StorageProvider> {
    agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>,
}

impl<T: StorageProvider + 'static> WorkflowHandler<T> {
    /// 创建新的 WorkflowHandler
    pub fn new(agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>) -> Self {
        Self { agent_loop_handler }
    }

    /// 处理工作流请求
    pub async fn handle_workflow(
        &self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        // 委托给 AgentLoopHandler
        // TODO: 未来可以添加工作流特定的预处理、验证等
        self.agent_loop_handler
            .write()
            .await
            .process_message(conversation_id, request)
            .await
    }
}
