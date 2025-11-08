# Signal-Pull Synchronization Architecture

## 概述

本规范定义了前后端状态同步的 **Signal-Pull 架构**，是 Context-Session 重构的核心同步机制。

### 核心原则

1. **严格分离信令与数据**：SSE 仅传输轻量级通知，REST API 提供数据访问
2. **前端主动拉取**：收到信号后，前端通过 REST API 按需获取数据
3. **单一真相来源（SSOT）**：REST API 是唯一的数据源，SSE 仅作为"缓存失效"通知
4. **自愈性**：前端可通过序列号检测丢失的更新并自动恢复

### 架构优势

- ✅ **健壮性**：SSE 信令丢失可通过 REST 拉取自动恢复
- ✅ **性能**：重数据（如工具输出）走 REST，不阻塞 SSE 通道
- ✅ **一致性**：后端为 SSOT，避免前后端状态分歧
- ✅ **可扩展性**：新增数据类型无需修改 SSE 协议

---

## 1. SSE 信令通道

### 1.1 端点

```
GET /contexts/{context_id}/events
```

### 1.2 事件类型

| Event              | Payload 字段                                      | 描述                                     |
|--------------------|---------------------------------------------------|----------------------------------------|
| `StateChanged`     | `context_id`, `new_state`, `timestamp`            | Context 状态变更（如 Idle → StreamingLLMResponse） |
| `ContentDelta`     | `context_id`, `message_id`, `current_sequence`, `timestamp` | **核心信令**：消息内容有新 chunks 可用（不含文本）      |
| `MessageCompleted` | `context_id`, `message_id`, `final_sequence`, `timestamp`    | 消息流式传输/处理完成                          |
| `Heartbeat`        | `timestamp`                                       | 保持连接的心跳信号                            |

### 1.3 事件格式

所有事件使用统一的 JSON 格式，通过 `type` 字段区分：

```json
{
  "type": "state_changed",
  "context_id": "ctx-uuid",
  "new_state": "StreamingLLMResponse",
  "timestamp": "2025-11-08T12:00:00Z"
}
```

```json
{
  "type": "content_delta",
  "context_id": "ctx-uuid",
  "message_id": "msg-uuid",
  "current_sequence": 7,
  "timestamp": "2025-11-08T12:00:01Z"
}
```

### 1.4 关键设计约束

- ✅ **轻量级**：所有事件 payload < 1KB
- ✅ **只包含元信息**：不包含消息文本、工具输出等"重数据"
- ✅ **序列号驱动**：通过 `sequence` 实现增量同步和自愈

---

## 2. REST 拉取 API

### 2.1 获取轻量级 Context 元数据

#### 端点

```
GET /contexts/{context_id}/metadata
```

#### 响应示例

```json
{
  "id": "ctx-uuid",
  "current_state": "Idle",
  "active_branch_name": "main",
  "message_count": 15,
  "model_id": "gpt-4",
  "mode": "code",
  "system_prompt_id": "prompt-uuid",
  "workspace_path": "/path/to/workspace"
}
```

#### 用途

- 初始化时获取 Context 概览
- 轮询检查状态变化（低频）
- 不返回消息内容，性能开销极小

---

### 2.2 批量获取消息

#### 端点

```
GET /contexts/{context_id}/messages?ids={id1},{id2},{id3}
```

#### 查询参数

- `ids` (可选)：逗号分隔的消息 UUID 列表
  - 提供时：返回指定消息
  - 不提供时：使用分页模式（`offset`, `limit`, `branch`）

#### 响应示例（批量模式）

```json
{
  "messages": [
    {
      "id": "msg-A",
      "role": "user",
      "content": [
        { "type": "text", "text": "Hello" }
      ],
      "tool_calls": null,
      "tool_result": null,
      "message_type": "text"
    },
    {
      "id": "msg-B",
      "role": "assistant",
      "content": [
        { "type": "text", "text": "Hi there!" }
      ],
      "tool_calls": null,
      "tool_result": null,
      "message_type": "text"
    }
  ],
  "requested_count": 2,
  "found_count": 2
}
```

#### 用途

- 加载历史消息
- 切换分支后批量获取消息
- 前端按需拉取指定消息

---

### 2.3 增量拉取消息内容（核心）

#### 端点

```
GET /contexts/{context_id}/messages/{message_id}/streaming-chunks?from_sequence={N}
```

#### 查询参数

- `from_sequence` (可选，默认 0)：起始序列号（不含），返回所有 > N 的 chunks

#### 响应示例

```json
{
  "context_id": "ctx-uuid",
  "message_id": "msg-uuid",
  "chunks": [
    { "sequence": 5, "delta": "Hello" },
    { "sequence": 6, "delta": " world" },
    { "sequence": 7, "delta": "!" }
  ],
  "current_sequence": 7,
  "has_more": false
}
```

#### 用途

- **核心场景**：响应 `ContentDelta` 信令，实现增量内容同步
- **自愈机制**：前端检测到序列号跳跃时，主动拉取缺失的 chunks
- **历史回放**：`from_sequence=0` 可获取完整内容

---

## 3. 前端处理流程

### 3.1 初始化

```typescript
// 1. 获取 Context 元数据
const metadata = await fetch(`/contexts/${contextId}/metadata`).then(r => r.json());

// 2. 批量获取历史消息
const branch = metadata.active_branch_name;
const messages = await fetch(`/contexts/${contextId}/messages?branch=${branch}`).then(r => r.json());

// 3. 建立 SSE 连接
const eventSource = new EventSource(`/contexts/${contextId}/events`);
eventSource.addEventListener('signal', handleSignalEvent);
```

### 3.2 处理 ContentDelta 信令

```typescript
interface ContentDeltaSignal {
  type: 'content_delta';
  context_id: string;
  message_id: string;
  current_sequence: number;
  timestamp: string;
}

async function handleContentDelta(signal: ContentDeltaSignal) {
  const messageId = signal.message_id;
  const serverSequence = signal.current_sequence;
  
  // 获取本地序列号
  const localSequence = messageStore.getSequence(messageId) || 0;
  
  // 只有当服务器序列号 > 本地序列号时才拉取
  if (serverSequence > localSequence) {
    try {
      const response = await fetch(
        `/contexts/${signal.context_id}/messages/${messageId}/streaming-chunks?from_sequence=${localSequence}`
      );
      const data = await response.json();
      
      // 应用增量 chunks
      for (const chunk of data.chunks) {
        messageStore.appendChunk(messageId, chunk.delta);
      }
      
      // 更新本地序列号
      messageStore.setSequence(messageId, serverSequence);
    } catch (error) {
      console.error('Pull content failed:', error);
      // ✅ 失败不更新 localSequence
      // 下一个 ContentDelta 信令会自动触发重试
    }
  }
}
```

### 3.3 处理 StateChanged 信令

```typescript
interface StateChangedSignal {
  type: 'state_changed';
  context_id: string;
  new_state: string;
  timestamp: string;
}

function handleStateChanged(signal: StateChangedSignal) {
  contextStore.setState(signal.context_id, signal.new_state);
  
  // 根据状态更新 UI
  switch (signal.new_state) {
    case 'ProcessingUserMessage':
      ui.showProcessingIndicator();
      break;
    case 'StreamingLLMResponse':
      ui.showStreamingIndicator();
      break;
    case 'AwaitingToolApproval':
      ui.showApprovalDialog();
      break;
    case 'Idle':
      ui.hideAllIndicators();
      break;
  }
}
```

### 3.4 处理 MessageCompleted 信令

```typescript
interface MessageCompletedSignal {
  type: 'message_completed';
  context_id: string;
  message_id: string;
  final_sequence: number;
  timestamp: string;
}

async function handleMessageCompleted(signal: MessageCompletedSignal) {
  const messageId = signal.message_id;
  
  // 最后一次拉取确保内容完整
  const localSequence = messageStore.getSequence(messageId) || 0;
  if (signal.final_sequence > localSequence) {
    await handleContentDelta({
      type: 'content_delta',
      context_id: signal.context_id,
      message_id: messageId,
      current_sequence: signal.final_sequence,
      timestamp: signal.timestamp
    });
  }
  
  // 标记消息为完成状态
  messageStore.markComplete(messageId);
  ui.hideStreamingIndicator(messageId);
}
```

---

## 4. 自愈机制

### 4.1 序列号跳跃检测

```typescript
function detectSequenceGap(messageId: string, serverSequence: number): boolean {
  const localSequence = messageStore.getSequence(messageId) || 0;
  const gap = serverSequence - localSequence;
  
  if (gap > 1) {
    console.warn(`Sequence gap detected: local=${localSequence}, server=${serverSequence}`);
    return true;
  }
  return false;
}
```

### 4.2 自动恢复

当检测到序列号跳跃时，前端**自动拉取**缺失的 chunks：

```typescript
if (detectSequenceGap(messageId, serverSequence)) {
  // 一次性拉取所有缺失的 chunks
  const response = await fetch(
    `/contexts/${contextId}/messages/${messageId}/streaming-chunks?from_sequence=${localSequence}`
  );
  const data = await response.json();
  
  // 应用所有缺失的 chunks
  for (const chunk of data.chunks) {
    messageStore.appendChunk(messageId, chunk.delta);
  }
  
  messageStore.setSequence(messageId, serverSequence);
}
```

### 4.3 SSE 重连处理

```typescript
eventSource.onerror = (event) => {
  console.error('SSE connection lost, will auto-reconnect');
  // EventSource 会自动重连，无需额外处理
  
  // 可选：重连后主动拉取元数据，确保状态同步
  setTimeout(() => {
    refreshContextMetadata(contextId);
  }, 1000);
};
```

---

## 5. 性能考虑

### 5.1 SSE 通道优化

- ✅ **轻量级事件**：每个事件 < 1KB，高频推送不会挤爆网络缓冲
- ✅ **心跳机制**：30秒心跳保持连接活跃，检测断线
- ✅ **事件压缩**：可选 gzip 压缩进一步减少带宽

### 5.2 REST API 优化

- ✅ **批量拉取**：支持一次请求获取多个消息
- ✅ **增量拉取**：只传输新增的 chunks，避免重复传输
- ✅ **缓存友好**：消息内容不可变，可设置长缓存时间

### 5.3 前端优化

- ✅ **防抖/节流**：高频信令可合并处理，避免过多 API 调用
- ✅ **本地缓存**：已拉取的消息缓存在本地，切换分支时快速恢复
- ✅ **虚拟滚动**：长对话场景使用虚拟滚动，按需渲染消息

---

## 6. 安全考虑

### 6.1 认证与授权

- SSE 和 REST API 都需要认证（如 JWT）
- 后端验证用户是否有权访问指定 Context
- 消息内容不包含敏感信息（如用户密码）

### 6.2 数据验证

- 前端验证序列号单调递增
- 后端验证 `from_sequence` 参数合法性
- 防止序列号溢出（使用 `u64`）

---

## 7. 错误处理

### 7.1 SSE 信令丢失

**场景**：网络波动导致部分信令未送达

**处理**：
- 前端检测到序列号跳跃
- 自动调用 REST API 拉取缺失的 chunks
- ✅ **无需人工干预**，系统自愈

### 7.2 REST API 调用失败

**场景**：拉取内容时网络中断

**处理**：
- 不更新本地序列号
- 下一个信令到达时自动重试
- 可选：显示"加载失败"提示，允许用户手动重试

### 7.3 SSE 连接断开

**场景**：长时间无活动或网络切换

**处理**：
- `EventSource` 自动重连
- 重连后刷新元数据，确保状态一致
- 前端显示"重新连接中"提示

---

## 8. 测试策略

### 8.1 单元测试

- ✅ SSE 事件序列化/反序列化
- ✅ REST API 响应格式验证
- ✅ 序列号跳跃检测逻辑
- ✅ 增量内容合并逻辑

### 8.2 集成测试

- ✅ 端到端流式场景：模拟 LLM 流式响应
- ✅ 信令丢失恢复：故意跳过信令，验证自愈
- ✅ SSE 重连：断开连接后验证状态同步
- ✅ 批量拉取：验证多消息并发拉取

### 8.3 性能测试

- ✅ SSE 高频事件压力测试（1000 events/s）
- ✅ REST API 并发拉取（100 concurrent requests）
- ✅ 大消息内容传输（10MB+）

---

## 9. 迁移指南

### 9.1 从旧架构迁移

**旧架构**：SSE 直接传输完整消息内容

```typescript
// 旧代码
eventSource.addEventListener('content_delta', (event) => {
  const data = JSON.parse(event.data);
  messageStore.appendContent(data.message_id, data.delta); // ❌ 数据在 SSE 中
});
```

**新架构**：SSE 仅传信令，内容通过 REST 拉取

```typescript
// 新代码
eventSource.addEventListener('signal', async (event) => {
  const signal = JSON.parse(event.data);
  
  if (signal.type === 'content_delta') {
    // ✅ 收到信令后拉取数据
    const response = await fetch(`/contexts/${signal.context_id}/messages/${signal.message_id}/streaming-chunks?from_sequence=${localSequence}`);
    const data = await response.json();
    
    for (const chunk of data.chunks) {
      messageStore.appendContent(signal.message_id, chunk.delta);
    }
  }
});
```

### 9.2 兼容性策略

- 阶段 1：同时支持新旧 API，前端逐步迁移
- 阶段 2：新功能只支持新 API
- 阶段 3：废弃旧 API

---

## 10. 未来扩展

### 10.1 多 Context 订阅

支持一个 SSE 连接订阅多个 Context：

```
GET /events?contexts={ctx1},{ctx2},{ctx3}
```

### 10.2 WebSocket 支持

对于需要双向通信的场景（如协作编辑），可扩展为 WebSocket：

- 保留 Signal-Pull 原则
- WebSocket 仍只传信令，数据走 REST

### 10.3 增量压缩

对于大量 chunks，可使用增量压缩算法（如 delta encoding）进一步减少传输量。

---

## 11. 参考资源

- [Design Document: Decision 4.5.1](../../design.md#decision-451-signal-pull-synchronization-model)
- [Context Manager API](../context-manager/spec.md)
- [Message Types](../message-types/spec.md)

---

## 变更历史

| 日期       | 版本  | 说明                      | 作者 |
|----------|-----|-------------------------|-----|
| 2025-11-08 | 1.0 | 初始版本：Signal-Pull 架构规范 | AI  |

