//! Chat Service - 聊天服务协调器
//!
//! 负责协调各个功能域的 Handler，提供统一的聊天服务接口。
//!
//! # 架构
//! ```text
//! ChatService (协调器)
//!     ├─> Builder (构建器模式)
//!     ├─> AgentLoopHandler (核心处理)
//!     └─> 各种依赖服务
//! ```

//! ```

use crate::{
    error::AppError, models::SendMessageRequest, services::session_manager::ChatSessionManager,
    storage::StorageProvider,
};
use actix_web_lab::{sse, util::InfallibleStream};
use std::sync::Arc;
use uuid::Uuid;

// Re-export ServiceResponse for external usage
pub use crate::models::ServiceResponse;

// 子模块
mod builder;
mod message_handler;
mod stream_handler;
mod tool_handler;
mod workflow_handler;

// 公开导出
pub use builder::ChatServiceBuilder;
pub use message_handler::MessageHandler;
pub use stream_handler::StreamHandler;
pub use tool_handler::ToolHandler;
pub use workflow_handler::WorkflowHandler;

/// Chat Service - 聊天服务主协调器
///
/// 负责协调消息处理、工具执行、工作流等功能。
/// 通过 Builder 模式构建，确保所有依赖都正确注入。
#[allow(dead_code)]
pub struct ChatService<T: StorageProvider> {
    conversation_id: Uuid,

    // 各功能域 Handlers
    message_handler: MessageHandler<T>,
    tool_handler: ToolHandler<T>,
    workflow_handler: WorkflowHandler<T>,
    stream_handler: StreamHandler<T>,
}

impl<T: StorageProvider + 'static> ChatService<T> {
    /// 创建 ChatService Builder
    ///
    /// # Example
    /// ```ignore
    /// let service = ChatService::builder(session_manager, conversation_id)
    ///     .with_copilot_client(client)
    ///     .with_tool_executor(executor)
    ///     .with_system_prompt_service(prompt_service)
    ///     .with_approval_manager(approval)
    ///     .with_workflow_service(workflows)
    ///     .build()?;
    /// ```
    pub fn builder(
        session_manager: Arc<ChatSessionManager<T>>,
        conversation_id: Uuid,
    ) -> ChatServiceBuilder<T> {
        ChatServiceBuilder::new(session_manager, conversation_id)
    }

    /// 🎯 处理消息 (非流式)
    ///
    /// 根据消息类型路由到相应的处理器。
    pub async fn process_message(
        &self,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        use crate::models::MessagePayload;

        // 根据消息类型路由到不同的 Handler
        match &request.payload {
            MessagePayload::Text { .. } | MessagePayload::FileReference { .. } => {
                // 路由到 MessageHandler
                self.message_handler
                    .handle_message(self.conversation_id, request)
                    .await
            }
            MessagePayload::Workflow { .. } => {
                // 路由到 WorkflowHandler
                self.workflow_handler
                    .handle_workflow(self.conversation_id, request)
                    .await
            }
            MessagePayload::ToolResult { .. } => {
                // 工具结果也通过 MessageHandler 处理
                self.message_handler
                    .handle_message(self.conversation_id, request)
                    .await
            }
        }
    }

    /// 🎯 处理消息 (流式响应)
    ///
    /// 通过 SSE 流式返回响应。
    pub async fn process_message_stream(
        &self,
        request: SendMessageRequest,
    ) -> Result<
        sse::Sse<InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>>,
        AppError,
    > {
        // 路由到 StreamHandler
        self.stream_handler
            .handle_message_stream(self.conversation_id, request)
            .await
    }

    /// 继续 Agent Loop (审批后)
    pub async fn continue_agent_loop_after_approval(
        &self,
        request_id: uuid::Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse, AppError> {
        // 路由到 ToolHandler
        self.tool_handler
            .continue_after_approval(self.conversation_id, request_id, approved, reason)
            .await
    }

    /// 审批工具调用
    pub async fn approve_tool_calls(
        &self,
        approved_tool_calls: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        // 路由到 ToolHandler
        self.tool_handler
            .approve_tools(self.conversation_id, approved_tool_calls)
            .await
    }
}

// TODO Phase 5: 添加测试模块
// #[cfg(test)]
// mod tests;
