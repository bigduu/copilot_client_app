# Agent Loop Handler 深度重构方案

**目标**: 彻底重构，将 569 行的 mod.rs 精简为轻量协调器  
**当前**: 1 个文件 569 行，职责混杂  
**目标**: 多个专职模块，mod.rs < 200 行

---

## 📊 当前问题

**agent_loop_handler/mod.rs (569行)**

### **代码分布**
```
├── Struct 定义 + Builder (80行)
├── process_message() (193行) ❌ 包含完整 LLM 处理
├── process_message_stream() (190行) ❌ 包含完整 SSE 流处理
└── 辅助方法 (106行)
```

### **核心问题**
1. ❌ **process_message** - 内联了所有 LLM 调用和流处理逻辑
2. ❌ **process_message_stream** - 内联了所有 SSE 流管理逻辑
3. ❌ **mod.rs 不应该有实现细节** - 应该纯粹协调

---

## 🎯 重构目标

### **新模块结构**

```
agent_loop_handler/
├── mod.rs (~180行) ✅ - 纯协调器，仅调度
├── llm_processor.rs (NEW, ~150行) - LLM 请求和响应处理
├── stream_processor.rs (NEW, ~120行) - SSE 流管理
├── initialization.rs ✅ (已存在)
├── message_intake.rs ✅ (已存在)
├── approval_flow.rs ✅ (已存在)
├── error_handling.rs ✅ (已存在)
└── utils.rs ✅ (已存在)
```

---

## 📋 详细设计

### **llm_processor.rs - LLM 处理模块**

**职责**: 处理所有与 LLM 交互的逻辑

```rust
//! LLM request processing and response handling

use super::error_handling;
use crate::{
    error::AppError,
    models::ServiceResponse,
    services::{copilot_stream_handler, session_manager::ChatSessionManager, EventBroadcaster},
    storage::StorageProvider,
};
use anyhow::Result;
use bytes::Bytes;
use context_manager::structs::context::ChatContext;
use copilot_client::{api::models::ChatCompletionRequest, CopilotClientTrait};
use log::{error, info};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

/// Process LLM request (non-streaming)
///
/// Handles the complete LLM interaction lifecycle:
/// 1. Transition context to AwaitingLLMResponse
/// 2. Send request to LLM
/// 3. Process streamed response chunks
/// 4. Handle completion or errors
pub async fn process_llm_request<T: StorageProvider>(
    copilot_client: &Arc<dyn CopilotClientTrait>,
    session_manager: &Arc<ChatSessionManager<T>>,
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    context: &Arc<RwLock<ChatContext>>,
    mut request: ChatCompletionRequest,
    conversation_id: Uuid,
) -> Result<ServiceResponse, AppError> {
    info!(
        "LLM Processor: Processing request with {} messages",
        request.messages.len()
    );

    // Ensure streaming is enabled
    request.stream = Some(true);

    // Transition to AwaitingLLMResponse
    {
        let mut ctx = context.write().await;
        let _updates = ctx.transition_to_awaiting_llm();
        info!("FSM: Transitioned to AwaitingLLMResponse");
    }

    // Call LLM
    match copilot_client.send_chat_completion_request(request).await {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                let body_text = response.text().await.unwrap_or_default();
                let error_msg = format_llm_error(status, &body_text);
                error!("{}", error_msg);
                return Err(error_handling::handle_llm_error(
                    session_manager,
                    context,
                    error_msg,
                )
                .await);
            }

            process_llm_stream(
                copilot_client,
                session_manager,
                event_broadcaster,
                context,
                response,
                conversation_id,
            )
            .await
        }
        Err(e) => {
            error!("Failed to send request to LLM: {}", e);
            Err(error_handling::handle_llm_error(session_manager, context, e.to_string()).await)
        }
    }
}

/// Process LLM response stream
async fn process_llm_stream<T: StorageProvider>(
    copilot_client: &Arc<dyn CopilotClientTrait>,
    session_manager: &Arc<ChatSessionManager<T>>,
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    context: &Arc<RwLock<ChatContext>>,
    response: reqwest::Response,
    conversation_id: Uuid,
) -> Result<ServiceResponse, AppError> {
    let mut full_text = String::new();
    let mut assistant_message_id: Option<Uuid> = None;

    let (chunk_tx, mut chunk_rx) = mpsc::channel::<Result<Bytes>>(100);
    let copilot_client = copilot_client.clone();
    let processor_handle = tokio::spawn(async move {
        copilot_client
            .process_chat_completion_stream(response, chunk_tx)
            .await
    });

    // Process chunks
    while let Some(chunk_result) = chunk_rx.recv().await {
        match chunk_result {
            Ok(bytes) => {
                if bytes.as_ref() == b"[DONE]" {
                    info!("Stream completed");
                    break;
                }

                if let Ok(chunk) =
                    serde_json::from_slice::<copilot_client::api::models::ChatCompletionStreamChunk>(
                        &bytes,
                    )
                {
                    copilot_stream_handler::handle_stream_chunk(
                        context,
                        chunk,
                        &mut full_text,
                        &mut assistant_message_id,
                    )
                    .await?;
                }
            }
            Err(e) => {
                error!("Stream error: {}", e);
                return Err(error_handling::handle_llm_error(
                    session_manager,
                    context,
                    e.to_string(),
                )
                .await);
            }
        }
    }

    if let Err(e) = processor_handle.await {
        error!("Stream processor panicked: {}", e);
        return Err(error_handling::handle_llm_error(
            session_manager,
            context,
            "Stream processor panicked".to_string(),
        )
        .await);
    }

    // Send completion event
    send_completion_event(event_broadcaster, context, conversation_id, assistant_message_id).await;

    // Auto-save
    session_manager.auto_save_if_dirty(context).await?;

    info!("LLM Processor: Request completed successfully");
    Ok(ServiceResponse::FinalMessage(full_text))
}

/// Send SSE completion event
async fn send_completion_event(
    event_broadcaster: &Option<Arc<EventBroadcaster>>,
    context: &Arc<RwLock<ChatContext>>,
    conversation_id: Uuid,
    assistant_message_id: Option<Uuid>,
) {
    if let Some(msg_id) = assistant_message_id {
        let final_sequence = {
            let ctx = context.read().await;
            ctx.message_sequence(msg_id).unwrap_or(0)
        };

        error_handling::send_sse_event(
            event_broadcaster,
            crate::controllers::context::streaming::SignalEvent::MessageCompleted {
                context_id: conversation_id.to_string(),
                message_id: msg_id.to_string(),
                final_sequence,
                timestamp: chrono::Utc::now().to_rfc3339(),
            },
        )
        .await;
    }
}

/// Format LLM error message
fn format_llm_error(status: reqwest::StatusCode, body: &str) -> String {
    if body.is_empty() {
        format!("LLM API error. Status: {}", status)
    } else {
        format!("LLM API error. Status: {} Body: {}", status, body)
    }
}
```

---

### **stream_processor.rs - SSE 流处理模块**

**职责**: 管理 Server-Sent Events 流

```rust
//! SSE stream processing for agent loop

use super::{error_handling, initialization, llm_processor, message_intake};
use crate::{
    error::AppError,
    models::SendMessageRequest,
    services::{
        copilot_stream_handler, llm_request_builder::LlmRequestBuilder, message_builder,
        message_processing::{FileReferenceHandler, TextMessageHandler, ToolResultHandler, WorkflowHandler},
        session_manager::ChatSessionManager,
        EventBroadcaster,
    },
    storage::StorageProvider,
};
use actix_web_lab::sse;
use anyhow::Result;
use bytes::Bytes;
use copilot_client::CopilotClientTrait;
use futures_util::StreamExt;
use log::{error, info};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Create and manage SSE stream for message processing
pub async fn create_sse_stream<T: StorageProvider + 'static>(
    session_manager: Arc<ChatSessionManager<T>>,
    copilot_client: Arc<dyn CopilotClientTrait>,
    event_broadcaster: Option<Arc<EventBroadcaster>>,
    llm_request_builder: LlmRequestBuilder,
    file_reference_handler: FileReferenceHandler<T>,
    workflow_handler: WorkflowHandler<T>,
    tool_result_handler: ToolResultHandler<T>,
    text_message_handler: TextMessageHandler<T>,
    conversation_id: Uuid,
    request: SendMessageRequest,
) -> Result<
    sse::Sse<actix_web_lab::util::InfallibleStream<tokio_stream::wrappers::ReceiverStream<sse::Event>>>,
    AppError,
> {
    use super::super::sse_response_builder;

    info!("Stream Processor: Creating SSE stream for conversation {}", conversation_id);

    // 1. Load context
    let context = initialization::load_context_for_request(&session_manager, conversation_id, &request).await?;
    let display_text = message_builder::compute_display_text(&request);
    let (event_tx, event_rx) = mpsc::channel::<sse::Event>(100);

    // 2. Handle special payloads
    if let Some(_response) = message_intake::handle_request_payload(
        &file_reference_handler,
        &workflow_handler,
        &tool_result_handler,
        &text_message_handler,
        &context,
        conversation_id,
        &request.payload,
        &display_text,
        &request.client_metadata,
    )
    .await?
    {
        // Early return for special payloads - send done event
        let _ = event_tx
            .send(sse_response_builder::build_done_event())
            .await;
        return Ok(sse_response_builder::create_sse_channel(event_rx));
    }

    // 3. Spawn async task for LLM streaming
    tokio::spawn(async move {
        if let Err(e) = process_llm_stream_async(
            session_manager,
            copilot_client,
            event_broadcaster,
            llm_request_builder,
            context,
            conversation_id,
            event_tx.clone(),
        )
        .await
        {
            error!("Stream processing error: {}", e);
            let _ = event_tx
                .send(sse_response_builder::build_error_event(&e.to_string()))
                .await;
        }

        let _ = event_tx
            .send(sse_response_builder::build_done_event())
            .await;
    });

    Ok(sse_response_builder::create_sse_channel(event_rx))
}

/// Process LLM stream asynchronously with SSE events
async fn process_llm_stream_async<T: StorageProvider>(
    session_manager: Arc<ChatSessionManager<T>>,
    copilot_client: Arc<dyn CopilotClientTrait>,
    event_broadcaster: Option<Arc<EventBroadcaster>>,
    llm_request_builder: LlmRequestBuilder,
    context: Arc<tokio::sync::RwLock<context_manager::structs::context::ChatContext>>,
    conversation_id: Uuid,
    event_tx: mpsc::Sender<sse::Event>,
) -> Result<(), AppError> {
    use super::super::sse_response_builder;

    // Build LLM request
    let llm_request = llm_request_builder.build(&context).await?;

    // Save system prompt snapshot
    if let Err(e) = initialization::save_system_prompt_from_request(
        &session_manager,
        conversation_id,
        &llm_request,
    )
    .await
    {
        log::warn!("Failed to save system prompt snapshot: {}", e);
    }

    let mut request = llm_request.request.clone();
    request.stream = Some(true);

    // Transition to AwaitingLLMResponse
    {
        let mut ctx = context.write().await;
        let _updates = ctx.transition_to_awaiting_llm();
    }

    // Send LLM request
    let response = copilot_client.send_chat_completion_request(request).await?;
    let status = response.status();

    if !status.is_success() {
        let body_text = response.text().await.unwrap_or_default();
        let error_msg = format!("LLM API error. Status: {} Body: {}", status, body_text);
        return Err(error_handling::handle_llm_error(&session_manager, &context, error_msg).await);
    }

    // Process stream chunks
    let mut full_text = String::new();
    let mut assistant_message_id: Option<Uuid> = None;
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                if bytes.as_ref() == b"[DONE]" {
                    break;
                }

                if let Ok(chunk) =
                    serde_json::from_slice::<copilot_client::api::models::ChatCompletionStreamChunk>(&bytes)
                {
                    copilot_stream_handler::handle_stream_chunk(
                        &context,
                        chunk.clone(),
                        &mut full_text,
                        &mut assistant_message_id,
                    )
                    .await?;

                    // Send SSE event for chunk
                    if let Some(msg_id) = assistant_message_id {
                        let sequence = {
                            let ctx = context.read().await;
                            ctx.message_sequence(msg_id).unwrap_or(0)
                        };

                        let event = sse_response_builder::build_chunk_event(
                            &conversation_id.to_string(),
                            &msg_id.to_string(),
                            sequence,
                            &chunk,
                        );

                        let _ = event_tx.send(event).await;
                    }
                }
            }
            Err(e) => {
                error!("Stream chunk error: {}", e);
                return Err(error_handling::handle_llm_error(&session_manager, &context, e.to_string()).await);
            }
        }
    }

    // Auto-save
    session_manager.auto_save_if_dirty(&context).await?;

    Ok(())
}
```

---

### **mod.rs - 精简的协调器**

**职责**: 纯粹的协调调度，不包含实现细节

```rust
//! Agent Loop Handler - Lightweight Coordinator
//!
//! This module serves as a lightweight coordinator for the agent loop lifecycle.
//! All implementation details are delegated to specialized sub-modules.

// Sub-modules
mod approval_flow;
mod error_handling;
mod initialization;
mod llm_processor;      // NEW
mod message_intake;
mod stream_processor;   // NEW
mod utils;

use crate::{
    error::AppError,
    models::{MessagePayload, SendMessageRequest, ServiceResponse},
    services::{
        llm_request_builder::LlmRequestBuilder,
        message_processing::{FileReferenceHandler, TextMessageHandler, ToolResultHandler, WorkflowHandler},
        session_manager::ChatSessionManager,
        EventBroadcaster,
    },
    storage::StorageProvider,
};
use copilot_client::CopilotClientTrait;
use log::info;
use std::sync::Arc;
use uuid::Uuid;

/// Agent Loop Handler - Coordinator
pub struct AgentLoopHandler<T: StorageProvider> {
    session_manager: Arc<ChatSessionManager<T>>,
    copilot_client: Arc<dyn CopilotClientTrait>,
    event_broadcaster: Option<Arc<EventBroadcaster>>,
    llm_request_builder: LlmRequestBuilder,
    // Message handlers
    file_reference_handler: FileReferenceHandler<T>,
    workflow_handler: WorkflowHandler<T>,
    tool_result_handler: ToolResultHandler<T>,
    text_message_handler: TextMessageHandler<T>,
}

impl<T: StorageProvider + 'static> AgentLoopHandler<T> {
    // ... builder code ...

    /// Process message (non-streaming)
    pub async fn process_message(
        &mut self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        info!("=== AgentLoopHandler::process_message START ===");

        // 1. Initialize
        let context =
            initialization::load_context_for_request(&self.session_manager, conversation_id, &request).await?;
        let display_text = message_builder::compute_display_text(&request);

        // 2. Handle special payloads
        if let Some(response) = message_intake::handle_request_payload(
            &self.file_reference_handler,
            &self.workflow_handler,
            &self.tool_result_handler,
            &self.text_message_handler,
            &context,
            conversation_id,
            &request.payload,
            &display_text,
            &request.client_metadata,
        )
        .await?
        {
            return Ok(response);
        }

        // 3. Build and process LLM request
        let llm_request = self.llm_request_builder.build(&context).await?;

        initialization::save_system_prompt_from_request(&self.session_manager, conversation_id, &llm_request)
            .await
            .ok();

        llm_processor::process_llm_request(
            &self.copilot_client,
            &self.session_manager,
            &self.event_broadcaster,
            &context,
            llm_request.request,
            conversation_id,
        )
        .await
    }

    /// Process message with SSE streaming
    pub async fn process_message_stream(
        &mut self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<actix_web_lab::sse::Sse<...>, AppError> {
        info!("=== AgentLoopHandler::process_message_stream START ===");

        stream_processor::create_sse_stream(
            self.session_manager.clone(),
            self.copilot_client.clone(),
            self.event_broadcaster.clone(),
            self.llm_request_builder.clone(),
            self.file_reference_handler.clone(),
            self.workflow_handler.clone(),
            self.tool_result_handler.clone(),
            self.text_message_handler.clone(),
            conversation_id,
            request,
        )
        .await
    }

    /// Continue after tool approval
    pub async fn continue_agent_loop_after_approval(
        &mut self,
        conversation_id: Uuid,
        request_id: Uuid,
    ) -> Result<ServiceResponse, AppError> {
        approval_flow::continue_after_approval(
            &self.session_manager,
            &self.copilot_client,
            &self.event_broadcaster,
            &self.llm_request_builder,
            conversation_id,
            request_id,
        )
        .await
    }

    /// Approve tool calls (legacy)
    pub async fn approve_tool_calls(
        &mut self,
        conversation_id: Uuid,
        approved_tool_calls: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        approval_flow::approve_tool_calls(&self.session_manager, conversation_id, approved_tool_calls).await
    }
}
```

---

## ✅ 重构效果

### **代码行数对比**

| 文件 | Before | After | 变化 |
|------|--------|-------|------|
| mod.rs | 569行 | ~180行 | -68% ✅ |
| llm_processor.rs | - | ~150行 | NEW |
| stream_processor.rs | - | ~120行 | NEW |
| **总计** | **569行** | **450行** | **-21%** |

### **职责清晰度**

| 方面 | Before | After |
|------|--------|-------|
| mod.rs 职责 | 协调器 + 实现 | ✅ 纯协调器 |
| 最大方法行数 | 200行 | <50行 |
| LLM 逻辑 | 内联 | ✅ 独立模块 |
| SSE 逻辑 | 内联 | ✅ 独立模块 |

---

## 🎯 重构步骤

1. ✅ 创建 `llm_processor.rs`
2. ✅ 创建 `stream_processor.rs`
3. ✅ 精简 `mod.rs`
4. ✅ 验证编译
5. ✅ 运行测试

**开始彻底重构！** 🚀
