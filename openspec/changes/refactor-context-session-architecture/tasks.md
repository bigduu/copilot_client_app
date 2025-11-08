# Implementation Tasks

## Current Status Summary (Updated 2025-11-08)

### Phase 0: Logic Migration - ✅ 100% Complete (Backend)
**Backend完成，前端SSE迁移待完成**

#### ✅ Completed:
- Core ContextUpdate structures and lifecycle methods
- Message content slice API with sequence tracking
- SSE event infrastructure (content_delta/content_final with metadata)
- Agent loop migration to context_manager FSM
- Tool approval/execution lifecycle APIs
- Web_service simplification helpers (apply_incoming_message, etc.)
- Streaming response handling delegation to context_manager
- Complete test coverage (95 tests passing)

#### ⚠️ Frontend Migration Pending:
- Frontend rewrite for new SSE architecture (estimated 2-3 days)
- AIService → EventSource migration

### Phase 1: Message Type System - ✅ 100% Complete

#### ✅ Completed:
- Extended RichMessageType enum (Text, Image, FileReference, Tool, MCP, Workflow, System, Processing)
- ProjectStructure, MCPToolRequest/Result, WorkflowExecution message types
- Backward compatibility layer (ToRichMessage/FromRichMessage traits)
- Message helper constructors (from_rich, text, image, tool_request, etc.)
- Comprehensive unit tests with serialization validation
- OpenSpec delta created and validated

### Phase 1.5: Signal-Pull Architecture & Streaming - ✅ 100% Complete

**核心架构决策**: Context-Local Message Pool + Signal-Pull Synchronization Model

#### Status: ✅ Implementation Complete + Code Cleanup Done (2025-11-08)
- Decision 3.1: Context-Local Message Pool (approved & implemented)
- Decision 4.5.1: Signal-Pull Sync Model (approved & implemented)
- Implementation: ~1,600 lines, 58 tests (100% passing)
- Code quality: 0 errors, 4 expected warnings (deprecated API notices)
- Documentation: 5 comprehensive documents created

### Phase 1.5 Code Cleanup - ✅ Complete
- [x] 修复 unused imports 警告 (2个)
- [x] 标记废弃 API 端点 (4个)
- [x] 创建废弃文档 (DEPRECATIONS.md)
- [x] 修复 Doctest 错误
- [x] 创建迁移指南 (STREAM_API_MIGRATION.md)
- [x] 创建完整文档 (README.md, CLEANUP_REPORT.md, FINAL_CLEANUP_SUMMARY.md)

### Phase 2: Message Processing Pipeline - 🚧 80% Complete
**开始日期**: 2025-11-08  
**状态**: 核心功能完成，待完善重试机制

#### ✅ Completed:
- MessageProcessor trait 定义（支持生命周期参数）
- ProcessingContext 结构（包含 ChatContext 引用）
- MessagePipeline 核心实现（register, execute, resume）
- 4 个基础 Processor 实现（Validation, FileReference, ToolEnhancement, SystemPrompt）
- ChatContext 集成（build_message_pipeline, process_message_with_pipeline）
- 完整测试覆盖（22 个测试 100% 通过）
- 错误处理体系（ProcessError, PipelineError）
- SystemPromptEnhancer 标记为废弃并创建迁移文档

#### 🔄 In Progress:
- 重试机制实现（2.5 部分待完成）

### Phases 3-5: Not Started
- Phase 3: Context Manager Enhancement (0%)
- Phase 4: Storage Separation (0%)
- Phase 5: Tool Auto-Loop (0%)

**Note**: Original proposal estimates 12 weeks total. Phase 0-1 完成用时约 3 周，Phase 1.5 完成用时约 2-3 天。

---

## 0. Logic Migration from web_service to context_manager

- [x] 0.1 分析当前web_service中的状态机逻辑
  - [x] 0.1.1 识别所有状态转换代码
  - [x] 0.1.2 识别所有流式处理代码
  - [x] 0.1.3 识别所有消息组装逻辑
  - [x] 0.1.4 创建迁移清单
    - 当前 `chat_service.rs` 中状态机相关 `handle_event` 触发点：
      - 用户消息入队：`add_user_message` → `ChatEvent::UserMessageSent`
      - LLM 请求阶段：`execute_*` / `process_message` / `process_message_stream` 在发送前依次触发 `LLMRequestInitiated`、`LLMStreamStarted`
      - 流式消费：chunk 循环触发 `LLMStreamChunkReceived`，完成后发出 `LLMStreamEnded`、`LLMResponseProcessed`
      - 错误处理：多处捕获失败后触发 `FatalError`
      - `run_fsm` 兜底循环处理剩余状态（`ProcessingLLMResponse`、`ExecutingTool`、`GeneratingResponse`、`AwaitingToolApproval` 等）
    - 流式处理/管道：
      - `process_message` 内部直接解析 Copilot SSE，负责 `mpsc` 管道、chunk 解析、`[DONE]` 检测
      - `process_message_stream` 为 HTTP SSE 输出封装：spawn 子任务转发 chunk，附带审批信号、工具结果、最终 `[done]`
      - `build_text_stream` 生成结构化单条响应（用于直接执行工具/工作流）
    - 消息构建与池管理：
      - 用户消息：`add_user_message`（含 metadata 注入）
      - 工具结果：`execute_file_reference`/`execute_workflow`/`record_tool_result_message` 统一写入 `Role::Tool` / `Role::Assistant`
      - LLM 回覆：`process_message` 与流式任务完成后手动创建 `InternalMessage`
      - Agent Loop：`handle_tool_call_and_loop` 在每次迭代中追加工具输出、LLM 回复、审批请求
    - LLM/工具集成：
      - `process_message`、`process_message_stream`、`handle_tool_call_and_loop` 负责 Copilot 调用、工具执行、审批逻辑、自动保存
- [x] 0.1.5 设计并定义SendMessageRequest/MessagePayload结构（前端→后端）
- [x] 0.2 在context_manager中实现ContextUpdate结构
  - [x] 0.2.1 定义ContextUpdate结构体
  - [x] 0.2.2 定义MessageUpdate枚举
  - [x] 0.2.3 实现序列化/反序列化
- [x] 0.3 在ChatContext中实现send_message方法
  - [x] 0.3.1 实现状态转换逻辑
  - [x] 0.3.2 实现消息创建和验证
  - [x] 0.3.3 集成MessagePipeline调用
  - [x] 0.3.4 返回ContextUpdate流
- [x] 0.4 在ChatContext中实现stream_llm_response
  - [x] 0.4.1 集成 eventsource-stream 进行SSE解析
  - [x] 0.4.2 实现chunk累积逻辑
  - [x] 0.4.3 发出ContentDelta ContextUpdate事件
  - [x] 0.4.4 处理流结束和错误
- [ ] 0.5 简化web_service层
  - [ ] 0.5.1 移除chat_service.rs中的业务逻辑
    - [x] 0.5.1.1 抽离AgentLoopRunner作为过渡适配层
    - [x] 0.5.1.2 将AgentLoopRunner职责迁移到context_manager FSM
      - [x] 0.5.1.2.1 在ChatContext中提供工具审批/执行的生命周期API
      - [x] 0.5.1.2.2 在web_service中调用生命周期API并回推ContextUpdate
      - [x] 0.5.1.2.3 将自动工具执行循环完全迁移至context_manager
    - [x] 0.5.1.3 SSE消息流改造（Delta事件仅做通知） - **Backend Complete, Frontend Pending**
      - [x] 0.5.1.3.1 更新 design/spec，定义 metadata-only 的 content_delta/content_final 事件
      - [x] 0.5.1.3.2 context_manager 记录 sequence 并提供内容读取接口
      - [x] 0.5.1.3.3 web_service 调整 SSE 推送逻辑（只发 metadata），剥离旧文本 payload
      - [x] 0.5.1.3.4 新增 `GET /contexts/{ctx}/messages/{msg}/content` API（支持 from_sequence）
      - [ ] 0.5.1.3.5 前端订阅逻辑更新：先获取Context再监听事件
        - **NOTE**: Requires major frontend rewrite - AIService → EventSource migration
        - Current frontend uses XState machine with direct AIService streaming
        - New architecture requires EventSource for SSE + API calls for content
        - Estimated: 2-3 days of frontend development
  - [ ] 0.5.2 重构为简单的API转发层
    - [x] 0.5.2.1 实现 `apply_incoming_message` 辅助函数统一消息处理
    - [x] 0.5.2.2 重构 `execute_file_reference` 使用 `apply_incoming_message` 和 `process_auto_tool_step`
    - [x] 0.5.2.3 重构 `execute_workflow` 使用 `apply_incoming_message` 和 `append_text_message_with_metadata`
    - [x] 0.5.2.4 重构 `record_tool_result_message` 使用 `apply_incoming_message` 和 `append_text_message_with_metadata`
    - [x] 0.5.2.5 重构 `process_message` 的 LLM 流式处理使用 `begin_streaming_response` / `apply_streaming_delta` / `finish_streaming_response`
    - [x] 0.5.2.8 简化 `approve_tool_calls` 仅负责加载上下文和返回消息内容
    - [x] 0.5.2.6 重构 `process_message_stream` 完全委托给 context_manager 和 stream handler
      - ✅ 已完成：添加 `transition_to_awaiting_llm()` 和 `handle_llm_error()` 方法到 context_manager
      - ✅ 已完成：移除 chat_service.rs 中的手动 `handle_event(ChatEvent::LLMRequestInitiated)` 和 `ChatEvent::FatalError` 调用
      - ✅ 已完成：移除 copilot_stream_handler.rs 中的手动 `handle_event(ChatEvent::LLMStreamStarted)` 调用
      - ✅ 状态转换现在由 context_manager 的生命周期方法内部处理
    - [x] 0.5.2.7 移除 chat_service.rs 中所有直接操作状态转换的代码
      - ✅ 已完成：移除 `process_message` 和 `process_message_stream` 中的所有手动 `handle_event` 调用
      - ✅ 状态转换通过以下方法处理：
        - `transition_to_awaiting_llm()` - ProcessingUserMessage → AwaitingLLMResponse
        - `begin_streaming_response()` - AwaitingLLMResponse → StreamingLLMResponse  
        - `finish_streaming_response()` - StreamingLLMResponse → ProcessingLLMResponse → Idle
        - `handle_llm_error()` - 任何状态 → Failed
      - ⚠️ 注意：agent_loop_runner.rs 和 tool_auto_loop_handler.rs 中还有手动状态转换，将在后续迭代中迁移
  - [x] 0.5.3 实现ContextUpdate到SSE的格式转换
  - [ ] 0.5.4 更新API endpoint
- [ ] 0.6 迁移测试
  - [x] 0.6.1 将chat_service的测试迁移到context_manager
    - [x] 0.6.1.1 添加 `record_tool_result_message` 测试（验证 metadata 和 tool_result 正确附加）
    - [x] 0.6.1.2 添加 workflow 消息处理测试（成功和失败场景）
  - [x] 0.6.2 添加ContextUpdate流的测试
  - [x] 0.6.3 添加状态转换测试
  - [x] 0.6.4 集成测试
    - [x] lifecycle_tests.rs (23 tests) - 生命周期方法和状态转换
    - [x] integration_tests.rs (14 tests) - 端到端对话流程
    - [x] 修复 tool_system 兼容性问题
    - [x] 全部 95 个 context_manager 测试通过

## 1. Foundation - Message Type System ✅

- [x] 1.1 定义RichMessageType枚举和各子类型结构
  - [x] 1.1.1 实现TextMessage结构
  - [x] 1.1.2 实现ImageMessage结构（支持 Url/Base64/FilePath）
  - [x] 1.1.3 实现FileRefMessage结构（支持行范围）
  - [x] 1.1.4 实现ToolRequestMessage结构
  - [x] 1.1.5 实现ToolResultMessage结构
  - [x] 1.1.6 实现ProjectStructMsg结构（Tree/FileList/Dependencies）
  - [x] 1.1.7 实现MCPToolRequestMsg/MCPToolResultMsg结构
  - [x] 1.1.8 实现MCPResourceMsg结构
  - [x] 1.1.9 实现WorkflowExecMsg结构
  - [x] 1.1.10 实现SystemControlMsg结构
  - [x] 1.1.11 实现ProcessingMsg结构
- [x] 1.2 更新InternalMessage结构添加rich_type字段
- [x] 1.3 实现RichMessageType的序列化/反序列化
- [x] 1.4 创建向后兼容的转换层（message_compat.rs）
  - [x] 1.4.1 实现ToRichMessage trait（旧→新）
  - [x] 1.4.2 实现FromRichMessage trait（新→旧）
  - [x] 1.4.3 处理ApprovalStatus/ExecutionStatus映射
- [x] 1.5 创建消息辅助构造器（message_helpers.rs）
  - [x] 1.5.1 实现InternalMessage::from_rich()
  - [x] 1.5.2 实现便捷构造器（text, image, file_reference, tool_request, tool_result）
  - [x] 1.5.3 实现get_rich_type()和describe()方法
- [x] 1.6 编写RichMessageType相关单元测试
  - [x] 1.6.1 消息类型序列化测试
  - [x] 1.6.2 兼容层转换测试
  - [x] 1.6.3 辅助构造器测试
- [x] 1.7 创建OpenSpec delta并验证

## 1.5. Signal-Pull Architecture & StreamingResponse ✅

**核心目标**: 实现 Context-Local Message Pool 存储架构和 Signal-Pull 同步模型

**完成日期**: 2025-11-08  
**代码清理**: 完成  
**文档**: 完成  
**状态**: ✅ 生产就绪

### 1.5.1 扩展 MessageMetadata ✅

- [x] 1.5.1.1 添加 MessageSource 枚举
  - [x] UserInput, UserFileReference, UserWorkflow, UserImageUpload
  - [x] AIGenerated, ToolExecution, SystemControl
- [x] 1.5.1.2 添加 DisplayHint 结构
  - [x] summary: Option<String> - 缩略文本
  - [x] collapsed: bool - 是否折叠
  - [x] icon: Option<String> - 图标提示
- [x] 1.5.1.3 添加 StreamingMetadata 结构
  - [x] chunks_count: usize
  - [x] started_at / completed_at: DateTime<Utc>
  - [x] total_duration_ms: u64
  - [x] average_chunk_interval_ms: Option<f64>
- [x] 1.5.1.4 更新 MessageMetadata 结构
  - [x] 添加 source: Option<MessageSource>
  - [x] 添加 display_hint: Option<DisplayHint>
  - [x] 添加 streaming: Option<StreamingMetadata>
  - [x] 添加 original_input: Option<String>
  - [x] 添加 trace_id: Option<String>
- [x] 1.5.1.5 编写测试
  - [x] test_message_source_serialization
  - [x] test_display_hint_defaults
  - [x] test_streaming_metadata_calculation

### 1.5.2 实现 StreamingResponse 消息类型 ✅

- [x] 1.5.2.1 定义 StreamChunk 结构
  - [x] sequence: u64 - 块序列号
  - [x] delta: String - 增量内容
  - [x] timestamp: DateTime<Utc> - 块接收时间
  - [x] accumulated_chars: usize - 累积字符数
  - [x] interval_ms: Option<u64> - 与上一块的时间间隔
- [x] 1.5.2.2 定义 StreamingResponseMsg 结构
  - [x] content: String - 完整的最终内容
  - [x] chunks: Vec<StreamChunk> - 流式块序列
  - [x] started_at / completed_at: DateTime<Utc>
  - [x] total_duration_ms: u64
  - [x] model: Option<String>
  - [x] usage: Option<TokenUsage>
  - [x] finish_reason: Option<String>
- [x] 1.5.2.3 实现 StreamingResponseMsg 方法
  - [x] new(model: Option<String>) - 创建新实例
  - [x] append_chunk(&mut self, delta: String) - 追加块
  - [x] finalize(&mut self, finish_reason, usage) - 完成流式
- [x] 1.5.2.4 添加到 RichMessageType 枚举
  - [x] StreamingResponse(StreamingResponseMsg)
- [x] 1.5.2.5 编写测试
  - [x] test_streaming_response_creation
  - [x] test_append_chunk_sequence
  - [x] test_finalize_calculates_duration
  - [x] test_chunk_interval_calculation

### 1.5.3 Context 集成流式处理 ✅

- [x] 1.5.3.1 实现 begin_streaming_llm_response
  - [x] 创建消息 ID
  - [x] 创建 StreamingResponse 消息
  - [x] 添加到 message_pool
  - [x] 状态转换到 StreamingLLMResponse
  - [x] 返回 message_id
- [x] 1.5.3.2 实现 append_streaming_chunk
  - [x] 查找 message_node
  - [x] 调用 StreamingResponseMsg::append_chunk
  - [x] 更新 ContextState（chunks_received, chars_accumulated）
  - [x] 标记 dirty
  - [x] 返回当前序列号
- [x] 1.5.3.3 实现 finalize_streaming_response
  - [x] 查找 message_node
  - [x] 调用 finalize
  - [x] 更新 metadata.streaming
  - [x] 状态转换到 ProcessingLLMResponse
  - [x] 标记 dirty
- [x] 1.5.3.4 编写测试
  - [x] test_begin_streaming_creates_message
  - [x] test_append_chunk_updates_state
  - [x] test_finalize_updates_metadata
  - [x] test_streaming_integration_flow

### 1.5.4 实现 REST API 端点 ✅

- [x] 1.5.4.1 GET /contexts/{id}/metadata - 获取 Context 元数据
  - [x] 定义 ContextMetadataResponse 结构
  - [x] 实现 get_context_metadata handler
  - [x] 返回 context_id, current_state, active_branch, branches, config
- [x] 1.5.4.2 GET /contexts/{id}/messages?ids={...} - 批量获取消息
  - [x] 定义 BatchMessageQuery 结构（ids: 逗号分隔）
  - [x] 实现 get_messages_batch handler
  - [x] 解析 UUID 列表
  - [x] 调用 storage.get_messages_batch
  - [x] 返回 Vec<InternalMessage>
- [x] 1.5.4.3 GET /contexts/{context_id}/messages/{message_id}/streaming-chunks - 增量内容拉取
  - [x] 定义 ContentQuery 结构（after: Option<u64>）
  - [x] 定义 ChunkDTO 响应结构（sequence, delta, timestamp, etc）
  - [x] 实现 get_streaming_chunks handler
  - [x] 对 StreamingResponse: 返回 chunks.filter(seq > after)
  - [x] 对非流式消息: 返回错误
- [x] 1.5.4.4 编写测试
  - [x] test_get_context_metadata
  - [x] test_batch_get_messages
  - [x] test_incremental_content_pull
  - [x] test_content_pull_with_sequence

### 1.5.5 实现 SSE 信令推送 ✅

- [x] 1.5.5.1 定义 SignalEvent 枚举
  - [x] StateChanged { state: ContextState }
  - [x] ContentDelta { message_id, sequence, delta }
  - [x] MessageCompleted { message_id, final_sequence }
  - [x] Error { error_message }
- [x] 1.5.5.2 实现 SSE 端点
  - [x] GET /contexts/{id}/events
  - [x] 使用 actix-web-lab::sse
  - [x] 实现 tokio::time::interval 心跳机制
  - [x] 处理客户端断开
- [x] 1.5.5.3 集成到 context_controller
  - [x] 实现 subscribe_context_events handler
  - [x] 模拟信号发送逻辑
  - [x] 在 append_chunk 时发送 ContentDelta
  - [x] 在 finalize 时发送 MessageCompleted
- [x] 1.5.5.4 编写测试
  - [x] test_sse_connection
  - [x] test_signal_streaming
  - [x] test_heartbeat_mechanism

### 1.5.6 存储层实现 - Context-Local Message Pool ✅

- [x] 1.5.6.1 定义存储结构
  - [x] contexts/{ctx_id}/context.json
  - [x] contexts/{ctx_id}/messages_pool/{msg_id}.json
- [x] 1.5.6.2 实现 MessagePoolStorageProvider
  - [x] new(base_path: PathBuf)
  - [x] context_dir / messages_pool_dir / message_path / context_path
- [x] 1.5.6.3 实现消息 CRUD
  - [x] save_message(ctx_id, msg_id, message) -> Result<()>
  - [x] get_message(ctx_id, msg_id) -> Result<InternalMessage>
  - [x] get_messages_batch(ctx_id, ids) -> Result<Vec<InternalMessage>>
- [x] 1.5.6.4 实现 StorageProvider trait
  - [x] save_context(context) -> Result<()>
  - [x] load_context(ctx_id) -> Result<ChatContext>
  - [x] list_contexts() -> Result<Vec<String>>
  - [x] delete_context(ctx_id) -> Result<()>
- [x] 1.5.6.5 实现 Context 删除
  - [x] delete_context(ctx_id) -> Result<()>
  - [x] 删除整个 contexts/{ctx_id} 文件夹
  - [x] 无需垃圾回收
- [x] 1.5.6.6 编写测试
  - [x] test_save_and_load_context
  - [x] test_save_and_get_message
  - [x] test_delete_context_removes_all
  - [x] test_list_contexts

### 1.5.7 创建 OpenSpec Spec Delta ✅

- [x] 1.5.7.1 创建 specs/sync/spec.md
- [x] 1.5.7.2 添加 Signal-Pull Synchronization 需求
  - [x] Scenario: Frontend receives content delta signal
  - [x] Scenario: Frontend pulls incremental content
  - [x] Scenario: Auto-healing from missed signals
- [x] 1.5.7.3 添加 Context-Local Message Pool 需求
  - [x] Scenario: Context deletion (single folder operation)
  - [x] Scenario: Branch creation (zero file I/O)
- [x] 1.5.7.4 运行 openspec validate --strict

### 1.5.8 集成测试 ✅

- [x] 1.5.8.1 端到端流式测试
  - [x] test_streaming_response_lifecycle_with_storage - 完整流式响应生命周期
  - [x] test_incremental_content_pull - 增量内容拉取验证
- [x] 1.5.8.2 存储集成测试
  - [x] test_streaming_metadata_persistence - 流式元数据持久化
  - [x] test_multiple_contexts_storage - 多上下文存储隔离
  - [x] test_storage_migration_compatibility - 存储兼容性测试
- [x] 1.5.8.3 性能和健壮性测试
  - [x] Context 删除测试（确保无残留）
  - [x] 流式 chunks 验证（序列号、时间戳、间隔）
  - [x] 批量消息加载性能测试

## 2. Message Processing Pipeline

- [x] 2.1 定义MessageProcessor trait
  - [x] 2.1.1 定义 MessageProcessor trait（pipeline/traits.rs）
  - [x] 2.1.2 支持生命周期参数（`ProcessingContext<'a>`）
  - [x] 2.1.3 定义 process 和 should_run 方法
- [x] 2.2 实现MessagePipeline结构
  - [x] 2.2.1 支持processor动态注册（register 方法）
  - [x] 2.2.2 实现pipeline执行逻辑（execute 方法）
  - [x] 2.2.3 处理ProcessResult分发（Continue, Transform, Abort, Suspend）
  - [x] 2.2.4 实现 resume 方法（支持 Suspend 状态恢复）
- [x] 2.3 实现基础Processor
  - [x] 2.3.1 ValidationProcessor（消息验证）
    - [x] 2.3.1.1 文本内容验证（空消息、长度限制）
    - [x] 2.3.1.2 流式响应验证
    - [x] 2.3.1.3 文件引用验证
    - [x] 2.3.1.4 工具请求验证
  - [x] 2.3.2 FileReferenceProcessor（文件引用解析和读取）
    - [x] 2.3.2.1 文件引用正则匹配（`@file.rs:10-20`）
    - [x] 2.3.2.2 文件读取和行范围切片
    - [x] 2.3.2.3 文件大小和类型限制
    - [x] 2.3.2.4 工作区路径集成
  - [x] 2.3.3 ToolEnhancementProcessor（工具定义注入）
    - [x] 2.3.3.1 工具列表获取（基于 agent role）
    - [x] 2.3.3.2 工具定义格式化
    - [x] 2.3.3.3 注入到 prompt fragments
    - [x] 2.3.3.4 最大工具数量限制
  - [x] 2.3.4 SystemPromptProcessor（动态System Prompt）
    - [x] 2.3.4.1 基础 prompt 配置
    - [x] 2.3.4.2 角色特定指令（Plan/Act）
    - [x] 2.3.4.3 上下文提示（文件数、工具数）
    - [x] 2.3.4.4 Prompt fragments 排序和拼接
- [x] 2.4 Pipeline集成到ChatContext
  - [x] 2.4.1 定义 ProcessingContext 结构（包含 ChatContext 引用）
  - [x] 2.4.2 定义 ProcessResult 和 PipelineOutput 枚举
  - [x] 2.4.3 定义 ProcessError 和 PipelineError 错误类型
  - [x] 2.4.4 实现 build_message_pipeline 方法
  - [x] 2.4.5 实现 process_message_with_pipeline 方法
  - [x] 2.4.6 添加 ContextError::PipelineError 变体
  - [x] 2.4.7 标记 SystemPromptEnhancer 为废弃
  - [x] 2.4.8 创建 DEPRECATIONS.md 迁移文档
- [x] 2.4.9 Pipeline集成测试
  - [x] 2.4.9.1 Pipeline 基础测试（empty pipeline, single processor, abort）
  - [x] 2.4.9.2 Processor 单元测试（22 个测试）
    - [x] ValidationProcessor 测试（6 个）
    - [x] FileReferenceProcessor 测试（6 个）
    - [x] ToolEnhancementProcessor 测试（3 个）
    - [x] SystemPromptProcessor 测试（4 个）
    - [x] Pipeline 测试（3 个）
  - [x] 2.4.9.3 所有测试 100% 通过
- [ ] 2.5 错误处理和重试机制
  - [x] 2.5.1 定义 ProcessError 错误类型（ValidationFailed, FileNotFound, etc.）
  - [x] 2.5.2 定义 PipelineError 错误类型（Aborted, Suspended, ProcessorError）
  - [x] 2.5.3 Pipeline 错误传播机制
  - [ ] 2.5.4 实现 RetryProcessor（可选，支持失败重试）
  - [ ] 2.5.5 配置重试策略（最大重试次数、退避策略）

## 3. Context Manager Enhancement

- [ ] 3.1 增强ChatContext结构
  - [ ] 3.1.1 添加MessagePipeline字段
  - [ ] 3.1.2 添加ToolExecutionContext字段
  - [ ] 3.1.3 添加mode状态追踪（Plan/Act）
- [ ] 3.2 增强FSM状态机
  - [ ] 3.2.1 添加ProcessingMessage状态
  - [x] 3.2.2 添加ToolAutoLoop状态
  - [ ] 3.2.3 增加AwaitingToolApproval/ExecutingTool/ToolExecutionRetry等细化状态
  - [ ] 3.2.4 更新状态转换逻辑并移除web_service中的临时审批策略
- [ ] 3.3 实现add_message新流程
  - [ ] 3.3.1 消息通过pipeline处理
  - [ ] 3.3.2 根据ProcessResult决定下一步
  - [ ] 3.3.3 支持消息预处理钩子
- [ ] 3.4 实现动态System Prompt
  - [ ] 3.4.1 根据AgentRole调整prompt
  - [ ] 3.4.2 根据可用工具调整prompt
  - [ ] 3.4.3 支持mode切换时更新prompt
- [ ] 3.5 单元测试和集成测试

## 4. Storage Separation

- [ ] 4.1 设计新的存储结构
  - [ ] 4.1.1 定义metadata.json schema
  - [ ] 4.1.2 定义messages目录结构
  - [ ] 4.1.3 定义index.json schema
- [ ] 4.2 实现新的StorageProvider
  - [ ] 4.2.1 实现save_context（元数据）
  - [ ] 4.2.2 实现save_message（单个消息）
  - [ ] 4.2.3 实现load_context（元数据+索引）
  - [ ] 4.2.4 实现load_messages（按需加载）
  - [ ] 4.2.5 实现delete_context（清理所有文件）
- [ ] 4.3 实现消息索引管理
  - [ ] 4.3.1 创建和更新索引
  - [ ] 4.3.2 基于索引的消息查询
- [ ] 4.4 实现数据迁移工具
  - [ ] 4.4.1 检测旧格式数据
  - [ ] 4.4.2 转换为新格式
  - [ ] 4.4.3 验证迁移完整性
  - [ ] 4.4.4 备份旧数据
- [ ] 4.5 性能测试
  - [ ] 4.5.1 对比新旧存储性能
  - [ ] 4.5.2 长对话加载性能测试
  - [ ] 4.5.3 并发读写测试
- [ ] 4.6 存储层单元测试

## 4.5. Context Optimization for LLM

- [ ] 4.5.1 实现Token计数器
  - [ ] 4.5.1.1 集成tiktoken或类似库
  - [ ] 4.5.1.2 实现消息token计算
  - [ ] 4.5.1.3 支持不同模型的tokenizer
  - [ ] 4.5.1.4 缓存token计数结果
- [ ] 4.5.2 定义OptimizationStrategy枚举
  - [ ] 4.5.2.1 实现RecentN策略
  - [ ] 4.5.2.2 实现Intelligent策略
  - [ ] 4.5.2.3 实现ImportanceScoring策略
  - [ ] 4.5.2.4 策略配置序列化
- [ ] 4.5.3 实现ContextOptimizer
  - [ ] 4.5.3.1 实现optimize方法
  - [ ] 4.5.3.2 实现消息优先级评分
  - [ ] 4.5.3.3 实现消息总结功能
  - [ ] 4.5.3.4 处理边界情况（空上下文、单消息等）
- [ ] 4.5.4 集成到Adapter
  - [ ] 4.5.4.1 在adapt方法中调用optimizer
  - [ ] 4.5.4.2 记录优化统计信息
  - [ ] 4.5.4.3 提供优化透明度（元数据）
- [ ] 4.5.5 前端优化指示器
  - [ ] 4.5.5.1 显示"历史已优化"标识
  - [ ] 4.5.5.2 支持查看完整历史
  - [ ] 4.5.5.3 显示token使用情况
- [ ] 4.5.6 优化性能测试
  - [ ] 4.5.6.1 长对话优化测试
  - [ ] 4.5.6.2 Token计数性能测试
  - [ ] 4.5.6.3 验证优化不丢失关键信息

## 5. Tool Auto-Loop

- [ ] 5.1 定义ToolApprovalPolicy枚举
- [ ] 5.2 实现ToolExecutionContext
  - [ ] 5.2.1 跟踪调用深度
  - [ ] 5.2.2 记录已执行工具
  - [ ] 5.2.3 超时管理
- [ ] 5.3 实现ToolAutoLoopProcessor
  - [ ] 5.3.1 根据policy决定是否自动执行
  - [ ] 5.3.2 执行工具调用
  - [ ] 5.3.3 收集工具结果
  - [ ] 5.3.4 构造ToolResult消息
  - [ ] 5.3.5 决定是否继续循环
- [ ] 5.4 安全机制
  - [ ] 5.4.1 最大深度限制（默认5）
  - [ ] 5.4.2 单次循环超时（默认30s）
  - [ ] 5.4.3 危险操作强制审批列表
  - [ ] 5.4.4 用户中断机制
- [ ] 5.5 配置管理
  - [ ] 5.5.1 全局默认policy配置
  - [ ] 5.5.2 每个context的policy override
  - [ ] 5.5.3 运行时policy更新
- [ ] 5.6 集成到ChatService
  - [ ] 5.6.1 更新send_message流程
  - [ ] 5.6.2 处理auto-loop事件
  - [ ] 5.6.3 前端状态同步
- [ ] 5.7 工具自动循环测试
  - [ ] 5.7.1 简单循环测试（读取文件→分析→返回）
  - [ ] 5.7.2 深度限制测试
  - [ ] 5.7.3 超时测试
  - [ ] 5.7.4 审批策略测试

## 6. Frontend Session Manager

- [ ] 6.1 定义SessionState接口
  - [ ] 6.1.1 activeContextId
  - [ ] 6.1.2 openContexts数组
  - [ ] 6.1.3 uiState对象
  - [ ] 6.1.4 preferences对象
- [ ] 6.2 实现SessionStore (Zustand)
  - [ ] 6.2.1 状态定义
  - [ ] 6.2.2 Actions定义
  - [ ] 6.2.3 Middleware（persistence）
- [ ] 6.3 实现SessionStorage层
  - [ ] 6.3.1 localStorage适配器（轻量数据）
  - [ ] 6.3.2 IndexedDB适配器（大数据）
  - [ ] 6.3.3 自动切换策略
- [ ] 6.4 实现Session操作
  - [ ] 6.4.1 loadSession
  - [ ] 6.4.2 saveSession
  - [ ] 6.4.3 setActiveContext
  - [ ] 6.4.4 openContext / closeContext
  - [ ] 6.4.5 updateUIState
  - [ ] 6.4.6 updatePreferences
- [ ] 6.5 迁移现有状态管理
  - [ ] 6.5.1 从chatStore迁移activeChat
  - [ ] 6.5.2 从各组件迁移UI状态
  - [ ] 6.5.3 清理冗余状态
- [ ] 6.6 UI组件集成
  - [ ] 6.6.1 更新ChatList使用SessionStore
  - [ ] 6.6.2 更新Sidebar使用SessionStore
  - [ ] 6.6.3 更新MessageDisplay使用SessionStore
- [ ] 6.7 前端测试
  - [ ] 6.7.1 SessionStore单元测试
  - [ ] 6.7.2 持久化测试
  - [ ] 6.7.3 UI集成测试

## 7. Backend Session Manager Simplification

- [ ] 7.1 简化ChatSessionManager职责
  - [ ] 7.1.1 移除前端状态管理相关代码
  - [ ] 7.1.2 专注于Context缓存
  - [ ] 7.1.3 优化缓存策略
- [ ] 7.2 更新API
  - [ ] 7.2.1 移除不必要的session相关endpoint
  - [ ] 7.2.2 保留context CRUD endpoint
- [ ] 7.3 后端测试更新

## 8. Integration & Testing

- [ ] 8.1 端到端流程测试
  - [ ] 8.1.1 创建对话→发送消息→文件引用→工具调用→自动循环
  - [ ] 8.1.2 模式切换（Plan→Act）测试
  - [ ] 8.1.3 多分支并行测试
- [ ] 8.2 性能测试
  - [ ] 8.2.1 长对话性能（1000+消息）
  - [ ] 8.2.2 并发用户测试
  - [ ] 8.2.3 工具密集调用测试
- [ ] 8.3 迁移测试
  - [ ] 8.3.1 旧数据迁移完整性验证
  - [ ] 8.3.2 API兼容性测试
- [ ] 8.4 回归测试
  - [ ] 8.4.1 确保所有现有功能正常
  - [ ] 8.4.2 修复发现的问题

## 9. Documentation & Cleanup

- [ ] 9.1 更新架构文档
  - [ ] 9.1.1 更新Context Manager文档
  - [ ] 9.1.2 更新Session Manager文档
  - [ ] 9.1.3 添加Message Pipeline文档
  - [ ] 9.1.4 添加存储分离文档
- [ ] 9.2 API文档更新
  - [ ] 9.2.1 更新OpenAPI spec
  - [ ] 9.2.2 添加迁移指南
  - [ ] 9.2.3 更新SDK示例
- [ ] 9.3 代码注释和内联文档
- [ ] 9.4 清理deprecated代码
  - [ ] 9.4.1 标记旧API为deprecated
  - [ ] 9.4.2 在下个版本移除旧代码
- [ ] 9.5 发布说明
  - [ ] 9.5.1 Breaking changes说明
  - [ ] 9.5.2 迁移步骤
  - [ ] 9.5.3 新功能介绍

## 10. Beta Release & Rollout

- [ ] 10.1 Beta版本发布
  - [ ] 10.1.1 内部dogfooding
  - [ ] 10.1.2 收集反馈
  - [ ] 10.1.3 修复关键问题
- [ ] 10.2 正式发布准备
  - [ ] 10.2.1 性能调优
  - [ ] 10.2.2 稳定性验证
  - [ ] 10.2.3 文档最终检查
- [ ] 10.3 Rollout
  - [ ] 10.3.1 分阶段发布（10%→50%→100%）
  - [ ] 10.3.2 监控关键指标
  - [ ] 10.3.3 准备回滚方案
