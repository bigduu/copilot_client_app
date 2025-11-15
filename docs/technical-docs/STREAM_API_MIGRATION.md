# 流式 API 未来升级指南

**创建日期**: 2025-11-08  
**状态**: 📋 可选升级（非必须）

---

## 概述

`chat_service.rs` 中使用的是**现有的稳定流式处理 API**，工作正常。Phase 1.5 实现了**新的 Signal-Pull 架构的流式 API**，提供了更多功能。两套 API 可以并存，迁移到新 API 是可选的架构升级，不是必须的清理工作。

---

## 旧 API vs 新 API 对比

### 1. 开始流式响应

#### ❌ 旧 API (chat_service.rs 第 688 行)
```rust
// 返回 (message_id, Vec<ContextUpdate>)
let result = ctx.begin_streaming_response();
let (message_id, _updates) = result;
```

#### ✅ 新 API (Phase 1.5)
```rust
// 返回 message_id，内部处理状态转换
let message_id = ctx.begin_streaming_llm_response(Some("gpt-4".to_string()));
```

**优势**:
- 新 API 支持指定模型名称
- 使用 `RichMessageType::StreamingResponse`
- 自动创建 `StreamingResponseMsg` 和元数据

---

### 2. 追加流式内容

#### ❌ 旧 API (chat_service.rs 第 700 行)
```rust
// 返回 Option<(ContextUpdate, u64)>
ctx.apply_streaming_delta(message_id, content.clone());
```

#### ✅ 新 API (Phase 1.5)
```rust
// 返回 Option<u64> 序列号
let sequence = ctx.append_streaming_chunk(message_id, content);
```

**优势**:
- 新 API 支持序列号追踪（Signal-Pull 核心）
- 自动记录 `StreamChunk` 元数据
- 支持增量内容拉取

---

### 3. 完成流式响应

#### ❌ 旧 API (chat_service.rs 第 736 行)
```rust
// 返回 Vec<ContextUpdate>
let _updates = ctx.finish_streaming_response(message_id);
```

#### ✅ 新 API (Phase 1.5)
```rust
// 返回 bool，支持完整元数据
let finalized = ctx.finalize_streaming_response(
    message_id,
    Some("stop".to_string()),    // finish_reason
    Some(usage)                   // TokenUsage
);
```

**优势**:
- 新 API 支持 `finish_reason` 和 `usage` 统计
- 自动计算流式元数据（duration, chunk intervals）
- 保存 `StreamingMetadata` 到 `MessageMetadata`

---

### 4. 中止流式响应

#### ❌ 旧 API (chat_service.rs 第 714 行)
```rust
// 返回 Vec<ContextUpdate>
let _ = ctx.abort_streaming_response(
    message_id,
    format!("stream error: {}", e),
);
```

#### ✅ 新 API (Phase 1.5)
```rust
// 应该使用 finalize_streaming_response 并标记错误
let _ = ctx.finalize_streaming_response(
    message_id,
    Some(format!("error: {}", e)),  // finish_reason 记录错误
    None                             // 无 usage
);
```

**说明**: 新架构中没有单独的 `abort` 方法，错误通过 `finish_reason` 记录

---

## 受影响的文件

### web_service/src/services/chat_service.rs

**使用旧 API 的位置**:

1. **第 688 行** - `process_message` 方法
   ```rust
   let result = ctx.begin_streaming_response();
   ```

2. **第 700 行** - `process_message` 方法
   ```rust
   ctx.apply_streaming_delta(message_id, content.clone());
   ```

3. **第 714 行** - `process_message` 方法错误处理
   ```rust
   ctx.abort_streaming_response(message_id, format!("stream error: {}", e));
   ```

4. **第 736 行** - `process_message` 方法完成
   ```rust
   ctx.finish_streaming_response(message_id);
   ```

**可能受影响的其他位置**:
- `copilot_stream_handler.rs` - 可能也使用旧 API
- `agent_loop_runner.rs` - 可能也使用旧 API

---

## 迁移步骤

### Phase 1: 迁移 chat_service.rs

#### 1.1 修改 `begin_streaming_response` 调用

**位置**: 第 685-693 行

**修改前**:
```rust
let (message_id, _) = {
    let mut ctx = context.write().await;
    // begin_streaming_response already handles state transition
    let result = ctx.begin_streaming_response();
    log::info!(
        "FSM: AwaitingLLMResponse -> StreamingLLMResponse"
    );
    result
};
```

**修改后**:
```rust
let message_id = {
    let mut ctx = context.write().await;
    // 使用新的 Phase 1.5 API
    let model = llm_request.prepared.model_id.clone();
    let message_id = ctx.begin_streaming_llm_response(Some(model));
    log::info!(
        "FSM: AwaitingLLMResponse -> StreamingLLMResponse (message_id: {})",
        message_id
    );
    message_id
};
```

#### 1.2 修改 `apply_streaming_delta` 调用

**位置**: 第 698-701 行

**修改前**:
```rust
let mut ctx = context.write().await;
// apply_streaming_delta already updates state, no need for manual event
ctx.apply_streaming_delta(message_id, content.clone());
```

**修改后**:
```rust
let mut ctx = context.write().await;
// 使用新的 Phase 1.5 API，返回序列号
if let Some(sequence) = ctx.append_streaming_chunk(message_id, content) {
    log::trace!("Appended chunk, sequence: {}", sequence);
}
```

#### 1.3 修改 `abort_streaming_response` 调用

**位置**: 第 712-717 行

**修改前**:
```rust
let mut ctx = context.write().await;
// abort_streaming_response already handles error state transition
let _ = ctx.abort_streaming_response(
    message_id,
    format!("stream error: {}", e),
);
```

**修改后**:
```rust
let mut ctx = context.write().await;
// 使用 finalize 标记错误
let error_msg = format!("stream error: {}", e);
ctx.finalize_streaming_response(
    message_id,
    Some(error_msg),  // finish_reason 记录错误
    None              // 没有 usage 数据
);
```

#### 1.4 修改 `finish_streaming_response` 调用

**位置**: 第 733-737 行

**修改前**:
```rust
let mut ctx = context.write().await;
// finish_streaming_response already handles state transitions:
// StreamingLLMResponse -> ProcessingLLMResponse -> Idle
let _ = ctx.finish_streaming_response(message_id);
log::info!("FSM: Finished streaming response");
```

**修改后**:
```rust
let mut ctx = context.write().await;
// 使用新的 Phase 1.5 API
// TODO: 从 LLM 响应中提取 usage 信息
let finalized = ctx.finalize_streaming_response(
    message_id,
    Some("stop".to_string()),  // 正常完成
    None                        // TODO: 添加 usage
);
log::info!("FSM: Finished streaming response (finalized: {})", finalized);
```

---

### Phase 2: 迁移其他服务

检查并迁移其他使用旧 API 的文件：

```bash
# 查找所有使用旧 API 的文件
grep -r "begin_streaming_response\|apply_streaming_delta\|finish_streaming_response\|abort_streaming_response" \
  crates/web_service/src/services/
```

---

### Phase 3: 废弃旧 API

在 `context_manager/src/structs/context_lifecycle.rs` 中标记旧 API 为废弃：

```rust
#[deprecated(
    since = "0.2.0",
    note = "Use begin_streaming_llm_response instead. This method does not support rich message types."
)]
pub fn begin_streaming_response(&mut self) -> (Uuid, Vec<ContextUpdate>) {
    // ...
}

#[deprecated(
    since = "0.2.0",
    note = "Use append_streaming_chunk instead. This method does not track sequence numbers."
)]
pub fn apply_streaming_delta<S>(
    &mut self,
    message_id: Uuid,
    delta: S,
) -> Option<(ContextUpdate, u64)>
where
    S: Into<String>,
{
    // ...
}

#[deprecated(
    since = "0.2.0",
    note = "Use finalize_streaming_response instead. This method does not save metadata."
)]
pub fn finish_streaming_response(&mut self, message_id: Uuid) -> Vec<ContextUpdate> {
    // ...
}

#[deprecated(
    since = "0.2.0",
    note = "Use finalize_streaming_response with error finish_reason instead."
)]
pub fn abort_streaming_response<S>(&mut self, message_id: Uuid, error: S) -> Vec<ContextUpdate>
where
    S: Into<String>,
{
    // ...
}
```

---

### Phase 4: 移除旧 API

在 v0.3.0 中完全移除这些废弃方法。

---

## 新 API 的优势

### 1. Signal-Pull 架构支持

新 API 生成的 `StreamingResponse` 消息类型支持：
- ✅ 序列号追踪（`StreamChunk.sequence`）
- ✅ 增量内容拉取（`get_streaming_chunks_after`）
- ✅ 前端自愈机制

### 2. Rich Message Types

新 API 使用 `RichMessageType::StreamingResponse`，包含：
- ✅ 完整的 chunks 历史
- ✅ 时间戳和时长统计
- ✅ 模型信息和 usage 统计
- ✅ 每个 chunk 的间隔时间

### 3. 元数据完整性

新 API 自动保存到 `MessageMetadata.streaming`：
- ✅ `chunks_count`
- ✅ `started_at` / `completed_at`
- ✅ `total_duration_ms`
- ✅ `average_chunk_interval_ms`

---

## 测试验证

迁移后需要验证的场景：

### 1. 正常流式响应
- [ ] LLM 流式响应完整接收
- [ ] 序列号正确递增
- [ ] 元数据正确保存
- [ ] 状态转换正确

### 2. 错误处理
- [ ] 流式中断时正确 finalize
- [ ] 错误信息记录在 finish_reason
- [ ] 状态正确回到 Idle

### 3. 工具调用
- [ ] 流式响应包含工具调用时正确解析
- [ ] agent loop 正常触发

### 4. 存储持久化
- [ ] StreamingResponse 消息正确保存
- [ ] 从存储加载后 chunks 完整
- [ ] 元数据完整保存

---

## 时间表

| 阶段 | 任务 | 预计时间 | 状态 |
|------|------|----------|------|
| Phase 1 | 迁移 chat_service.rs | 1-2 小时 | 📅 待开始 |
| Phase 2 | 迁移其他服务 | 1 小时 | 📅 待开始 |
| Phase 3 | 标记旧 API 废弃 | 30 分钟 | 📅 待开始 |
| Phase 4 | 测试验证 | 1 小时 | 📅 待开始 |
| Phase 5 | 移除旧 API (v0.3.0) | - | 🔜 计划中 |

---

## 兼容性说明

### 向后兼容

- ✅ 迁移过程中保留旧 API
- ✅ 添加废弃警告
- ✅ 给用户足够迁移时间

### 破坏性变更

在 v0.3.0 移除旧 API 时：
- ❌ `begin_streaming_response()` 将被移除
- ❌ `apply_streaming_delta()` 将被移除
- ❌ `finish_streaming_response()` 将被移除
- ❌ `abort_streaming_response()` 将被移除

**迁移路径**: 参见本文档 Phase 1 部分

---

## 参考资源

- [Phase 1.5 完成总结](openspec/changes/refactor-context-session-architecture/PHASE_1.5_COMPLETION_SUMMARY.md)
- [Signal-Pull 架构规范](openspec/changes/refactor-context-session-architecture/specs/sync/spec.md)
- [流式处理测试](crates/context_manager/tests/streaming_tests.rs)
- [集成测试](crates/web_service/tests/signal_pull_integration_tests.rs)

---

**状态**: 📋 **可选的架构升级**  
**优先级**: 🔵 **低-中** - 现有 API 工作正常，新 API 提供额外功能  
**建议**: 根据需求决定是否升级。如果需要 Signal-Pull 的序列号追踪和增量拉取功能，则考虑迁移

