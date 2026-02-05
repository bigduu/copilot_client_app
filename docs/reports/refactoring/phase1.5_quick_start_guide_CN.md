# Phase 1.5 快速开始指南

**日期**: 2025-11-08  
**状态**: 设计锁定，准备实施  
**Change ID**: `refactor-context-session-architecture`

---

## 🚀 在新会话中快速恢复上下文

### 1. 查看 Change 概览

```bash
# 查看 change 基本信息
openspec show refactor-context-session-architecture

# 查看所有活跃的 changes
openspec list

# 查看详细的 delta specs
openspec show refactor-context-session-architecture --json --deltas-only
```

### 2. 查看任务清单

```bash
# 直接查看 tasks.md
cat openspec/changes/refactor-context-session-architecture/tasks.md

# 或使用编辑器打开
code openspec/changes/refactor-context-session-architecture/tasks.md
```

**当前进度**: Phase 1.5 任务清单在 `tasks.md` 第 171-350 行

### 3. 查看技术设计

```bash
# 查看 design.md（包含 Decision 3.1 和 4.5.1）
code openspec/changes/refactor-context-session-architecture/design.md
```

**关键决策位置**:
- Decision 3.1: Context-Local Message Pool (design.md:1086-1181)
- Decision 4.5.1: Signal-Pull Sync Model (design.md:1296-1506)

### 4. 查看实施计划

```bash
# 详细的实施计划文档
code docs/reports/refactoring/signal_pull_architecture_implementation_plan_CN.md
```

---

## 📋 Phase 1.5 任务概览

### 核心目标
实现 **Context-Local Message Pool** 存储架构和 **Signal-Pull** 同步模型

### 8 个主要任务模块

1. **1.5.1** 扩展 MessageMetadata ⏳
   - 添加 MessageSource、DisplayHint、StreamingMetadata
   - 文件: `crates/context_manager/src/structs/metadata.rs`

2. **1.5.2** 实现 StreamingResponse 消息类型 ⏳
   - StreamChunk + StreamingResponseMsg
   - 文件: `crates/context_manager/src/structs/message_types.rs`

3. **1.5.3** Context 集成流式处理 ⏳
   - begin_streaming_llm_response / append_streaming_chunk / finalize_streaming_response
   - 文件: `crates/context_manager/src/structs/context_lifecycle.rs`

4. **1.5.4** 实现 REST API 端点 ⏳
   - GET /contexts/{id}
   - GET /contexts/{id}/messages?ids={...}
   - GET /contexts/{id}/messages/{msg_id}/content?from_sequence={N}
   - 文件: `crates/web_service/src/routes/context_routes.rs`

5. **1.5.5** 实现 SSE 信令推送 ⏳
   - GET /contexts/{id}/stream
   - SSESignal 枚举 + broadcast 机制
   - 文件: `crates/web_service/src/routes/sse_routes.rs`

6. **1.5.6** 存储层实现 ⏳
   - FileSystemMessageStorage
   - Context-Local Message Pool 结构
   - 文件: `crates/context_manager/src/storage/message_storage.rs`

7. **1.5.7** 创建 OpenSpec Spec Delta ⏳
   - specs/sync/spec.md
   - Signal-Pull 和 Message Pool 需求

8. **1.5.8** 集成测试 ⏳
   - 端到端流式测试
   - 存储集成测试
   - 负载测试

---

## 🎯 推荐实施顺序

### 阶段 1: 核心数据结构（1-2 天）
```
1.5.1 → 1.5.2 → 1.5.3
```
- 先完成 MessageMetadata 扩展
- 然后实现 StreamingResponse 类型
- 最后集成到 Context 生命周期

### 阶段 2: API 层（1 天）
```
1.5.4 → 1.5.5
```
- REST API 端点
- SSE 信令推送

### 阶段 3: 存储层（1 天）
```
1.5.6
```
- FileSystemMessageStorage 实现

### 阶段 4: 文档和测试（0.5 天）
```
1.5.7 → 1.5.8
```
- OpenSpec delta
- 集成测试

---

## 📚 关键文档索引

### 设计文档
- `openspec/changes/refactor-context-session-architecture/design.md`
  - Decision 3.1: Context-Local Message Pool
  - Decision 4.5.1: Signal-Pull Synchronization Model
  - API 契约详细说明

### 实施计划
- `docs/reports/refactoring/signal_pull_architecture_implementation_plan_CN.md`
  - 详细的任务分解
  - 代码示例和结构定义
  - 测试用例清单
  - 工作量估算

### 相关报告
- `docs/reports/refactoring/storage_architecture_gap_analysis_CN.md`
- `docs/reports/refactoring/frontend_backend_state_sync_review_CN.md`
- `docs/reports/archive/refactoring/phase1_message_type_system_summary_CN.md`

---

## 🔍 快速定位代码位置

### 现有相关文件

```bash
# 消息类型系统（Phase 1 已完成）
crates/context_manager/src/structs/
├── message_types.rs      # RichMessageType 枚举
├── message.rs            # InternalMessage（已有 rich_type 字段）
├── message_compat.rs     # 兼容层
└── message_helpers.rs     # 辅助构造器

# 元数据结构（需要扩展）
crates/context_manager/src/structs/metadata.rs

# Context 生命周期（需要添加流式方法）
crates/context_manager/src/structs/context_lifecycle.rs

# Web Service 路由（需要新增）
crates/web_service/src/routes/
├── context_routes.rs     # REST API（需要创建或扩展）
└── sse_routes.rs         # SSE 端点（需要创建）

# 存储层（需要创建）
crates/context_manager/src/storage/
└── message_storage.rs    # FileSystemMessageStorage（需要创建）
```

---

## ✅ 验证清单

在开始实施前，确认：

- [ ] 已阅读 `design.md` 中的 Decision 3.1 和 4.5.1
- [ ] 已阅读 `signal_pull_architecture_implementation_plan_CN.md`
- [ ] 已理解 Context-Local Message Pool 存储结构
- [ ] 已理解 Signal-Pull 同步模型
- [ ] 已查看 `tasks.md` 中的 Phase 1.5 任务清单

---

## 🛠️ 开发工作流

### 1. 开始新任务

```bash
# 查看当前任务状态
grep -n "1.5.1" openspec/changes/refactor-context-session-architecture/tasks.md

# 标记任务为进行中（手动更新 tasks.md）
# - [ ] → - [x] （完成时）
```

### 2. 编写代码

按照 `signal_pull_architecture_implementation_plan_CN.md` 中的代码示例和结构定义实施。

### 3. 运行测试

```bash
# 运行 context_manager 测试
cd crates/context_manager
cargo test

# 运行 web_service 测试
cd ../web_service
cargo test
```

### 4. 验证 OpenSpec

```bash
# 验证 change 有效性
openspec validate refactor-context-session-architecture --strict
```

### 5. 更新任务状态

完成每个子任务后，更新 `tasks.md` 中的复选框：
```markdown
- [x] 1.5.1.1 添加 MessageSource 枚举
```

---

## 📝 示例：开始 Task 1.5.1

### 步骤 1: 查看任务详情

```bash
# 查看 tasks.md 中 1.5.1 的详细要求
grep -A 20 "1.5.1 扩展 MessageMetadata" openspec/changes/refactor-context-session-architecture/tasks.md
```

### 步骤 2: 查看实施计划中的代码示例

```bash
# 查看 MessageMetadata 扩展的详细设计
grep -A 50 "Task 1.5.1: 扩展 MessageMetadata" docs/reports/refactoring/signal_pull_architecture_implementation_plan_CN.md
```

### 步骤 3: 查看现有代码

```bash
# 查看当前的 MessageMetadata 结构
cat crates/context_manager/src/structs/metadata.rs
```

### 步骤 4: 开始实施

按照实施计划中的结构定义，扩展 `MessageMetadata`。

---

## 🎓 关键概念速查

### Context-Local Message Pool
- 每个 Context 是自包含文件夹
- 所有消息存储在 `contexts/{ctx_id}/messages_pool/`
- 分支操作零文件 I/O（只修改 metadata.json）
- 删除 Context = 删除整个文件夹（无需 GC）

### Signal-Pull Model
- **SSE 信令**: 只推送轻量级通知（message_id + sequence）
- **REST 拉取**: 前端主动获取数据
- **自愈机制**: 通过序列号自动修复丢失的信令

### StreamingResponse
- 完整的流式响应记录（chunks + metadata）
- 支持前端"重放"流式效果
- 包含时间戳、间隔、token 使用等元数据

---

## 🚨 常见问题

### Q: 如何知道从哪里开始？
A: 从 Task 1.5.1 开始，按顺序实施。每个任务都有详细的子任务清单。

### Q: 如果遇到设计问题怎么办？
A: 参考 `design.md` 中的 Decision 3.1 和 4.5.1，或查看实施计划文档。

### Q: 如何验证实施是否正确？
A: 
1. 运行测试（`cargo test`）
2. 验证 OpenSpec（`openspec validate --strict`）
3. 检查任务清单（所有子任务标记为完成）

### Q: 实施计划中的代码示例可以直接用吗？
A: 代码示例是伪代码/结构定义，需要根据实际代码库调整。主要参考结构和字段定义。

---

## 📞 需要帮助？

如果在新会话中遇到问题：

1. **查看设计文档**: `design.md` 包含所有技术决策
2. **查看实施计划**: `signal_pull_architecture_implementation_plan_CN.md` 包含详细步骤
3. **查看任务清单**: `tasks.md` 包含所有待办事项
4. **运行 OpenSpec 命令**: `openspec show refactor-context-session-architecture`

---

**祝实施顺利！** 🚀






