//! Message Handler - 消息处理域
//!
//! 负责处理文本消息和文件引用消息的业务逻辑

use crate::{
    error::AppError,
    models::{SendMessageRequest, ServiceResponse},
    services::agent_loop_handler::AgentLoopHandler,
    storage::StorageProvider,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// 消息处理 Handler
///
/// 负责处理：
/// - 文本消息
/// - 文件引用消息
pub struct MessageHandler<T: StorageProvider> {
    agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>,
}

impl<T: StorageProvider + 'static> MessageHandler<T> {
    /// 创建新的 MessageHandler
    pub fn new(agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>) -> Self {
        Self { agent_loop_handler }
    }

    /// 处理消息请求
    ///
    /// 根据消息类型（Text/FileReference）进行处理
    pub async fn handle_message(
        &self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        // 委托给 AgentLoopHandler 处理
        // TODO: 未来可以在这里添加消息预处理、验证等逻辑
        self.agent_loop_handler
            .write()
            .await
            .process_message(conversation_id, request)
            .await
    }
}
