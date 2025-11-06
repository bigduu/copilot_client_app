# Implementation Tasks

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
- [ ] 0.4 在ChatContext中实现stream_llm_response
  - [ ] 0.4.1 集成reqwest-sse进行SSE解析
  - [x] 0.4.2 实现chunk累积逻辑
  - [x] 0.4.3 发出ContentDelta ContextUpdate事件
  - [x] 0.4.4 处理流结束和错误
- [ ] 0.5 简化web_service层
  - [ ] 0.5.1 移除chat_service.rs中的业务逻辑
    - [x] 0.5.1.1 抽离AgentLoopRunner作为过渡适配层
    - [ ] 0.5.1.2 将AgentLoopRunner职责迁移到context_manager FSM
      - [x] 0.5.1.2.1 在ChatContext中提供工具审批/执行的生命周期API
      - [x] 0.5.1.2.2 在web_service中调用生命周期API并回推ContextUpdate
      - [ ] 0.5.1.2.3 将自动工具执行循环完全迁移至context_manager
    - [ ] 0.5.1.3 拆分SSE消息流与ContextUpdate流
      - [ ] 0.5.1.3.1 设计content_delta / final_message等事件格式
      - [ ] 0.5.1.3.2 在web_service中分离context事件与内容事件
      - [ ] 0.5.1.3.3 前端订阅逻辑更新：先获取Context再监听事件
  - [ ] 0.5.2 重构为简单的API转发层
  - [x] 0.5.3 实现ContextUpdate到SSE的格式转换
  - [ ] 0.5.4 更新API endpoint
- [ ] 0.6 迁移测试
  - [ ] 0.6.1 将chat_service的测试迁移到context_manager
  - [ ] 0.6.2 添加ContextUpdate流的测试
  - [ ] 0.6.3 添加状态转换测试
  - [ ] 0.6.4 集成测试

## 1. Foundation - Message Type System

- [ ] 1.1 定义MessageType枚举和各子类型结构
  - [ ] 1.1.1 实现TextMessage结构
  - [ ] 1.1.2 实现FileRefMessage结构
  - [ ] 1.1.3 实现ToolRequestMessage结构
  - [ ] 1.1.4 实现ToolResultMessage结构
  - [ ] 1.1.5 实现SystemMessage结构
- [ ] 1.2 更新InternalMessage结构使用新的MessageType
- [ ] 1.3 实现MessageType的序列化/反序列化
- [ ] 1.4 创建向后兼容的转换层（旧格式→新格式）
- [ ] 1.5 编写MessageType相关单元测试

## 2. Message Processing Pipeline

- [ ] 2.1 定义MessageProcessor trait
- [ ] 2.2 实现MessagePipeline结构
  - [ ] 2.2.1 支持processor动态注册
  - [ ] 2.2.2 实现pipeline执行逻辑
  - [ ] 2.2.3 处理ProcessResult分发
- [ ] 2.3 实现基础Processor
  - [ ] 2.3.1 ValidationProcessor（消息验证）
  - [ ] 2.3.2 FileReferenceProcessor（文件引用解析和读取）
  - [ ] 2.3.3 ToolEnhancementProcessor（工具定义注入）
  - [ ] 2.3.4 SystemPromptProcessor（动态System Prompt）
- [ ] 2.4 Pipeline集成测试
- [ ] 2.5 错误处理和重试机制

## 3. Context Manager Enhancement

- [ ] 3.1 增强ChatContext结构
  - [ ] 3.1.1 添加MessagePipeline字段
  - [ ] 3.1.2 添加ToolExecutionContext字段
  - [ ] 3.1.3 添加mode状态追踪（Plan/Act）
- [ ] 3.2 增强FSM状态机
  - [ ] 3.2.1 添加ProcessingMessage状态
  - [ ] 3.2.2 添加ToolAutoLoop状态
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
