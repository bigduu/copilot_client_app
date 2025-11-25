//! Stream Handler - 流式响应处理域
//!
//! 负责 SSE 流式响应的处理

use crate::{
    error::AppError, models::SendMessageRequest, services::agent_loop_handler::AgentLoopHandler,
    storage::StorageProvider,
};
use actix_web_lab::{sse, util::InfallibleStream};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

/// 流式响应 Handler
///
/// 负责处理：
/// - SSE 流式响应
/// - 实时消息推送
pub struct StreamHandler<T: StorageProvider> {
    agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>,
}

impl<T: StorageProvider + 'static> StreamHandler<T> {
    /// 创建新的 StreamHandler
    pub fn new(agent_loop_handler: Arc<RwLock<AgentLoopHandler<T>>>) -> Self {
        Self { agent_loop_handler }
    }

    /// 处理流式消息请求
    pub async fn handle_message_stream(
        &self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<sse::Sse<InfallibleStream<ReceiverStream<sse::Event>>>, AppError> {
        // 委托给 AgentLoopHandler
        // TODO: 未来可以添加流式响应的额外处理、监控等
        self.agent_loop_handler
            .write()
            .await
            .process_message_stream(conversation_id, request)
            .await
    }
}
