# Chat Service 重构实施计划 - 方案A

## 📋 目标结构

```
crates/web_service/src/services/
├── chat_service.rs (旧文件，649行)  ← 重命名为 chat_service_legacy.rs
└── chat_service/                     ← 新模块文件夹
    ├── mod.rs              (~150行)  - 核心 ChatService 协调器
    ├── builder.rs          (~120行)  - Builder 模式实现
    ├── message_handler.rs  (~120行)  - 消息处理 Handler
    ├── tool_handler.rs     (~100行)  - 工具相关 Handler
    ├── workflow_handler.rs (~80行)   - 工作流 Handler
    ├── stream_handler.rs   (~100行)  - 流式响应 Handler
    └── tests/                         - 测试模块
        ├── mod.rs          (~50行)   - 测试公共设施
        ├── fixtures/                  - 测试固件
        │   ├── mod.rs
        │   ├── test_env.rs (~100行)  - 测试环境设置
        │   └── mock_clients.rs (~80行) - Mock实现
        ├── message_tests.rs (~120行)  - 消息处理测试
        ├── tool_tests.rs    (~100行)  - 工具相关测试
        ├── workflow_tests.rs (~80行)  - 工作流测试
        └── stream_tests.rs  (~100行)  - 流式响应测试
```

---

## 🎯 各模块职责划分

### **1. mod.rs - 核心协调器** (~150行)

#### 职责
- ✅ ChatService 结构体定义
- ✅ 会话生命周期管理
- ✅ 消息路由与分发
- ✅ 跨 Handler 编排
- ✅ 统一错误处理
- ✅ 公共 API 暴露

#### 核心代码结构
```rust
//! Chat Service - 聊天服务协调器
//!
//! 负责协调各个 Handler 完成聊天相关的业务逻辑

use crate::error::AppError;
use crate::models::{SendMessageRequest, ServiceResponse};
use crate::storage::StorageProvider;
use std::sync::Arc;
use uuid::Uuid;

// 导入各个 Handler
mod message_handler;
mod tool_handler;
mod workflow_handler;
mod stream_handler;
mod builder;

#[cfg(test)]
mod tests;

// 公开导出
pub use builder::ChatServiceBuilder;
pub use message_handler::MessageHandler;
pub use tool_handler::ToolHandler;
pub use workflow_handler::WorkflowHandler;
pub use stream_handler::StreamHandler;

/// Chat Service - 聊天服务主协调器
pub struct ChatService<T: StorageProvider> {
    conversation_id: Uuid,
    
    // Handlers - 各功能域处理器
    message_handler: MessageHandler<T>,
    tool_handler: ToolHandler<T>,
    workflow_handler: WorkflowHandler<T>,
    stream_handler: StreamHandler<T>,
}

impl<T: StorageProvider + 'static> ChatService<T> {
    /// 创建 Builder
    pub fn builder(
        session_manager: Arc<SessionManager<T>>,
        conversation_id: Uuid,
    ) -> ChatServiceBuilder<T> {
        ChatServiceBuilder::new(session_manager, conversation_id)
    }
    
    /// 🎯 核心方法: 处理消息 (非流式)
    ///
    /// 根据消息类型路由到不同的 Handler
    pub async fn process_message(
        &mut self,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        // 1. 验证会话状态
        self.validate_session_state().await?;
        
        // 2. 根据 Payload 类型路由
        match request.payload {
            MessagePayload::Text { .. } | MessagePayload::FileReference { .. } => {
                // 路由到 MessageHandler
                self.message_handler
                    .handle_message(self.conversation_id, request)
                    .await
            }
            MessagePayload::ToolResult { .. } => {
                // 路由到 ToolHandler
                self.tool_handler
                    .handle_tool_result(self.conversation_id, request)
                    .await
            }
            MessagePayload::Workflow { .. } => {
                // 路由到 WorkflowHandler
                self.workflow_handler
                    .handle_workflow(self.conversation_id, request)
                    .await
            }
        }
    }
    
    /// 🎯 核心方法: 处理消息 (流式响应)
    pub async fn process_message_stream(
        &mut self,
        request: SendMessageRequest,
    ) -> Result<SseStream, AppError> {
        // 路由到 StreamHandler
        self.stream_handler
            .handle_message_stream(self.conversation_id, request)
            .await
    }
    
    /// 工具审批 - 委托给 ToolHandler
    pub async fn approve_tool_calls(
        &mut self,
        approved_tools: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        self.tool_handler
            .approve_tools(self.conversation_id, approved_tools)
            .await
    }
    
    /// Agent Loop 继续 - 委托给 ToolHandler
    pub async fn continue_agent_loop_after_approval(
        &mut self,
        request_id: Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse, AppError> {
        self.tool_handler
            .continue_after_approval(self.conversation_id, request_id, approved, reason)
            .await
    }
    
    // 内部辅助方法
    async fn validate_session_state(&self) -> Result<(), AppError> {
        // 验证会话是否存在、是否有效等
        Ok(())
    }
}
```

#### 不包含的内容
- ❌ 具体的消息处理逻辑（在 MessageHandler）
- ❌ LLM 调用逻辑（在各 Handler）
- ❌ 工具执行逻辑（在 ToolHandler）
- ❌ Builder 实现（在 builder.rs）

---

### **2. message_handler.rs - 消息处理** (~120行)

#### 职责
- ✅ 文本消息处理
- ✅ 文件引用处理
- ✅ 消息验证
- ✅ LLM 调用（文本消息）
- ✅ 消息记录

#### 核心代码结构
```rust
//! 消息处理 Handler
//!
//! 负责处理文本消息和文件引用消息

use crate::error::AppError;
use crate::models::{SendMessageRequest, ServiceResponse};
use crate::services::{
    agent_loop_handler::AgentLoopHandler,
    message_processing::{FileReferenceHandler, TextMessageHandler},
};
use std::sync::Arc;
use uuid::Uuid;

/// 消息处理 Handler
pub struct MessageHandler<T: StorageProvider> {
    // 依赖的处理器
    text_handler: TextMessageHandler<T>,
    file_ref_handler: FileReferenceHandler<T>,
    
    // AgentLoopHandler (只用于消息相关的部分)
    agent_loop_handler: AgentLoopHandler<T>,
}

impl<T: StorageProvider + 'static> MessageHandler<T> {
    pub fn new(
        session_manager: Arc<SessionManager<T>>,
        copilot_client: Arc<dyn CopilotClient>,
        /* ... 其他依赖 */
    ) -> Self {
        Self {
            text_handler: TextMessageHandler::new(session_manager.clone()),
            file_ref_handler: FileReferenceHandler::new(session_manager.clone()),
            agent_loop_handler: AgentLoopHandler::new(/* ... */),
        }
    }
    
    /// 处理消息（文本或文件引用）
    pub async fn handle_message(
        &mut self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        match request.payload {
            MessagePayload::Text { .. } => {
                // 调用 AgentLoopHandler 的消息处理
                self.agent_loop_handler
                    .process_message(conversation_id, request)
                    .await
            }
            MessagePayload::FileReference { .. } => {
                // 文件引用特殊处理
                self.handle_file_reference(conversation_id, request)
                    .await
            }
            _ => Err(AppError::InvalidPayload("Not a message payload".into())),
        }
    }
    
    async fn handle_file_reference(
        &self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        // 文件引用的具体处理逻辑
        // ...
    }
}
```

---

### **3. tool_handler.rs - 工具处理** (~100行)

#### 职责
- ✅ 工具审批流程
- ✅ 工具执行结果处理
- ✅ Agent Loop 继续
- ✅ 工具状态管理

#### 核心代码结构
```rust
//! 工具处理 Handler
//!
//! 负责工具审批、执行和 Agent Loop 管理

use crate::error::AppError;
use crate::models::{SendMessageRequest, ServiceResponse};
use crate::services::{
    approval_manager::ApprovalManager,
    tool_coordinator::ToolExecutor,
};
use std::sync::Arc;
use uuid::Uuid;

/// 工具处理 Handler
pub struct ToolHandler<T: StorageProvider> {
    session_manager: Arc<SessionManager<T>>,
    tool_executor: Arc<ToolExecutor>,
    approval_manager: Arc<ApprovalManager>,
    agent_service: Arc<AgentService>,
}

impl<T: StorageProvider + 'static> ToolHandler<T> {
    pub fn new(
        session_manager: Arc<SessionManager<T>>,
        tool_executor: Arc<ToolExecutor>,
        approval_manager: Arc<ApprovalManager>,
        agent_service: Arc<AgentService>,
    ) -> Self {
        Self {
            session_manager,
            tool_executor,
            approval_manager,
            agent_service,
        }
    }
    
    /// 处理工具结果消息
    pub async fn handle_tool_result(
        &self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        // 工具结果处理逻辑
        // ...
    }
    
    /// 审批工具调用
    pub async fn approve_tools(
        &self,
        conversation_id: Uuid,
        approved_tools: Vec<String>,
    ) -> Result<ServiceResponse, AppError> {
        // 工具审批逻辑
        // ...
    }
    
    /// Agent Loop 继续（审批后）
    pub async fn continue_after_approval(
        &self,
        conversation_id: Uuid,
        request_id: Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse, AppError> {
        // 继续 Agent Loop 的逻辑
        // ...
    }
}
```

---

### **4. workflow_handler.rs - 工作流处理** (~80行)

#### 职责
- ✅ 工作流执行
- ✅ 工作流状态管理
- ✅ 工作流结果处理

#### 核心代码结构
```rust
//! 工作流处理 Handler

use crate::error::AppError;
use crate::models::{SendMessageRequest, ServiceResponse};
use crate::services::workflow_service::WorkflowService;
use std::sync::Arc;
use uuid::Uuid;

/// 工作流处理 Handler
pub struct WorkflowHandler<T: StorageProvider> {
    session_manager: Arc<SessionManager<T>>,
    workflow_service: Arc<WorkflowService>,
}

impl<T: StorageProvider + 'static> WorkflowHandler<T> {
    pub fn new(
        session_manager: Arc<SessionManager<T>>,
        workflow_service: Arc<WorkflowService>,
    ) -> Self {
        Self {
            session_manager,
            workflow_service,
        }
    }
    
    /// 处理工作流请求
    pub async fn handle_workflow(
        &self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<ServiceResponse, AppError> {
        // 工作流执行逻辑
        // ...
    }
}
```

---

### **5. stream_handler.rs - 流式响应** (~100行)

#### 职责
- ✅ SSE 流式响应处理
- ✅ 流式消息处理
- ✅ 实时事件推送

#### 核心代码结构
```rust
//! 流式响应 Handler
//!
//! 负责 SSE 流式响应处理

use crate::error::AppError;
use crate::models::SendMessageRequest;
use crate::services::agent_loop_handler::AgentLoopHandler;
use actix_web_lab::sse;
use std::sync::Arc;
use uuid::Uuid;

/// 流式响应 Handler
pub struct StreamHandler<T: StorageProvider> {
    agent_loop_handler: AgentLoopHandler<T>,
}

impl<T: StorageProvider + 'static> StreamHandler<T> {
    pub fn new(agent_loop_handler: AgentLoopHandler<T>) -> Self {
        Self { agent_loop_handler }
    }
    
    /// 处理流式消息
    pub async fn handle_message_stream(
        &mut self,
        conversation_id: Uuid,
        request: SendMessageRequest,
    ) -> Result<SseStream, AppError> {
        // 委托给 AgentLoopHandler 的流式处理
        self.agent_loop_handler
            .process_message_stream(conversation_id, request)
            .await
    }
}
```

---

### **6. builder.rs - Builder 模式** (~120行)

#### 职责
- ✅ ChatService 构建
- ✅ 依赖注入
- ✅ 参数验证

#### 核心代码结构
```rust
//! ChatService Builder 模式实现

use crate::error::AppError;
use super::{ChatService, MessageHandler, ToolHandler, WorkflowHandler, StreamHandler};
use std::sync::Arc;
use uuid::Uuid;

/// ChatService Builder
pub struct ChatServiceBuilder<T: StorageProvider> {
    session_manager: Arc<SessionManager<T>>,
    conversation_id: Uuid,
    copilot_client: Option<Arc<dyn CopilotClient>>,
    tool_executor: Option<Arc<ToolExecutor>>,
    system_prompt_service: Option<Arc<SystemPromptService>>,
    // ... 其他依赖
}

impl<T: StorageProvider + 'static> ChatServiceBuilder<T> {
    pub fn new(session_manager: Arc<SessionManager<T>>, conversation_id: Uuid) -> Self {
        Self {
            session_manager,
            conversation_id,
            copilot_client: None,
            tool_executor: None,
            system_prompt_service: None,
        }
    }
    
    pub fn with_copilot_client(mut self, client: Arc<dyn CopilotClient>) -> Self {
        self.copilot_client = Some(client);
        self
    }
    
    // ... 其他 with_* 方法
    
    pub fn build(self) -> Result<ChatService<T>, AppError> {
        // 验证必需的依赖
        let copilot_client = self.copilot_client
            .ok_or_else(|| AppError::BuilderError("Missing copilot_client".into()))?;
        
        // 构建各个 Handler
        let message_handler = MessageHandler::new(/* ... */);
        let tool_handler = ToolHandler::new(/* ... */);
        let workflow_handler = WorkflowHandler::new(/* ... */);
        let stream_handler = StreamHandler::new(/* ... */);
        
        Ok(ChatService {
            conversation_id: self.conversation_id,
            message_handler,
            tool_handler,
            workflow_handler,
            stream_handler,
        })
    }
}
```

---

### **7. tests/ - 测试模块**

#### 目录结构
```
tests/
├── mod.rs              - 测试模块入口 + 公共工具
├── fixtures/           - 测试固件
│   ├── mod.rs
│   ├── test_env.rs     - 测试环境设置
│   └── mock_clients.rs - Mock 实现
├── message_tests.rs    - 消息处理测试
├── tool_tests.rs       - 工具相关测试
├── workflow_tests.rs   - 工作流测试
└── stream_tests.rs     - 流式响应测试
```

#### tests/mod.rs (~50行)
```rust
//! 测试模块公共设施

pub mod fixtures;

// 公共测试工具函数
pub fn assert_service_response_ok(response: &ServiceResponse) {
    // ...
}
```

#### tests/fixtures/test_env.rs (~100行)
```rust
//! 测试环境设置

pub struct TestEnv {
    pub chat_service: ChatService<MemoryStorageProvider>,
    pub context: Arc<RwLock<ChatContext>>,
    pub conversation_id: Uuid,
    // ...
}

impl TestEnv {
    pub async fn setup() -> Self {
        // 统一的测试环境设置
        // ...
    }
}
```

#### tests/message_tests.rs (~120行)
```rust
//! 消息处理测试

use super::fixtures::TestEnv;

#[tokio::test]
async fn test_process_text_message() {
    let env = TestEnv::setup().await;
    // 测试文本消息处理
}

#[tokio::test]
async fn test_process_file_reference() {
    let env = TestEnv::setup().await;
    // 测试文件引用处理
}

// ... 更多消息相关测试
```

#### tests/tool_tests.rs (~100行)
```rust
//! 工具相关测试

use super::fixtures::TestEnv;

#[tokio::test]
async fn test_tool_approval() {
    let env = TestEnv::setup().await;
    // 测试工具审批
}

#[tokio::test]
async fn test_tool_result_handling() {
    let env = TestEnv::setup().await;
    // 测试工具结果处理
}

// ... 更多工具相关测试
```

---

## 🔄 实施步骤

### Phase 1: 准备工作
1. ✅ 创建 `chat_service/` 文件夹
2. ✅ 重命名旧文件为 `chat_service_legacy.rs`
3. ✅ 创建占位符文件（空的 mod.rs 等）

### Phase 2: 提取 Builder (最简单)
1. 创建 `builder.rs`
2. 从旧文件复制 Builder 相关代码
3. 清理和优化

### Phase 3: 创建 Handlers (核心)
1. **MessageHandler** - 提取消息处理逻辑
2. **ToolHandler** - 提取工具相关逻辑
3. **WorkflowHandler** - 提取工作流逻辑
4. **StreamHandler** - 提取流式响应逻辑

### Phase 4: 创建协调器 mod.rs
1. 定义 ChatService 结构
2. 实现路由逻辑
3. 组合各个 Handler
4. 实现公共 API

### Phase 5: 重构测试
1. 创建 `tests/` 目录结构
2. 提取公共测试设施到 `fixtures/`
3. 按功能分类测试代码
4. 确保所有测试通过

### Phase 6: 验证和清理
1. 更新 `services/mod.rs` 导出
2. 验证所有调用方编译通过
3. 运行完整测试套件
4. 删除 `chat_service_legacy.rs`

---

## 📊 工作量估算

| 步骤 | 文件 | 预估行数 | 复杂度 | 时间 |
|------|------|----------|--------|------|
| Phase 1 | 准备 | - | 简单 | 5分钟 |
| Phase 2 | builder.rs | 120 | 简单 | 15分钟 |
| Phase 3.1 | message_handler.rs | 120 | 中等 | 25分钟 |
| Phase 3.2 | tool_handler.rs | 100 | 中等 | 20分钟 |
| Phase 3.3 | workflow_handler.rs | 80 | 简单 | 15分钟 |
| Phase 3.4 | stream_handler.rs | 100 | 中等 | 20分钟 |
| Phase 4 | mod.rs | 150 | 复杂 | 30分钟 |
| Phase 5 | tests/* | 500 | 中等 | 40分钟 |
| Phase 6 | 验证清理 | - | 简单 | 15分钟 |
| **总计** | **~1200行** | - | - | **~3小时** |

---

## ✅ 成功标准

### 功能性
- ✅ 所有现有功能正常工作
- ✅ 所有测试通过
- ✅ 所有调用方编译通过

### 代码质量
- ✅ 每个模块职责单一清晰
- ✅ 没有重复代码
- ✅ 命名规范统一

### 可维护性
- ✅ 新功能容易添加
- ✅ 测试容易找到和编写
- ✅ 文档清晰完整

---

## 🚨 风险和注意事项

### 潜在风险
1. **AgentLoopHandler 依赖**
   - 风险: 多个 Handler 都依赖 AgentLoopHandler
   - 缓解: 明确哪些功能由 Handler 自己实现，哪些委托

2. **测试迁移**
   - 风险: 测试代码可能依赖内部实现
   - 缓解: 先确保测试通过，再重构测试

3. **调用方更新**
   - 风险: 多个地方调用 ChatService
   - 缓解: API 保持兼容，只改内部实现

### 注意事项
- ⚠️ **保持向后兼容** - 公共 API 不变
- ⚠️ **增量迁移** - 一个 Phase 一个 Phase 来
- ⚠️ **持续测试** - 每个 Phase 后都跑测试

---

## 🎯 下一步

**准备好开始实施了吗？**

建议从 **Phase 1 + Phase 2** 开始（创建结构 + Builder）：
1. 风险最小
2. 快速验证结构
3. 为后续打基础

**要我开始实施吗？** 🚀
