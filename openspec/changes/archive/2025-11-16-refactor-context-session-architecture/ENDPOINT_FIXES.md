# API 端点修复记录

## 问题描述

前端使用的 API 端点与后端实际端点不匹配，导致 400/404 错误。

---

## 修复的端点

### 1. SSE 订阅端点

**问题**: 前端使用 `/contexts/{id}/stream`，后端实际是 `/contexts/{id}/events`

**修复**:
- 文件: `src/services/BackendContextService.ts`
- 行号: 557
- 修改前: `${API_BASE_URL}/contexts/${contextId}/stream`
- 修改后: `${API_BASE_URL}/contexts/${contextId}/events`

**后端实现**:
```rust
#[get("/contexts/{id}/events")]
pub async fn subscribe_context_events(...)
```

---

### 2. 发送消息端点

**问题**: 前端使用 `/contexts/{id}/messages`，后端实际是 `/contexts/{id}/actions/send_message`

**修复**:
- 文件: `src/services/BackendContextService.ts`
- 行号: 636
- 修改前: `/contexts/${contextId}/messages`
- 修改后: `/contexts/${contextId}/actions/send_message`

**后端实现**:
```rust
#[post("/contexts/{id}/actions/send_message")]
pub async fn send_message_action(...)
```

---

### 3. 获取内容端点

**问题**: 前端使用 `/contexts/{id}/messages/{msg_id}/content`，后端实际是 `/contexts/{id}/messages/{msg_id}/streaming-chunks`

**修复**:
- 文件: `src/services/BackendContextService.ts`
- 行号: 609-610
- 修改前: `/contexts/${contextId}/messages/${messageId}/content`
- 修改后: `/contexts/${contextId}/messages/${messageId}/streaming-chunks`

**后端实现**:
```rust
#[get("/contexts/{context_id}/messages/{message_id}/streaming-chunks")]
pub async fn get_streaming_chunks(...)
```

---

## 修复的数据格式

### 4. 内容响应格式

**问题**: 前端期望 `{ content: string, sequence: number }`，后端返回 `{ chunks: Array<{sequence, delta}>, current_sequence, has_more }`

**修复**:

#### 类型定义 (`src/types/sse.ts`)
```typescript
// 修改前
export interface MessageContentResponse {
  context_id: string;
  message_id: string;
  sequence: number;
  content: string;
}

// 修改后
export interface MessageContentResponse {
  context_id: string;
  message_id: string;
  chunks: Array<{
    sequence: number;
    delta: string;
  }>;
  current_sequence: number;
  has_more: boolean;
}
```

#### 处理逻辑 (`src/hooks/useChatManager.ts`)
```typescript
// 修改前
currentSequenceRef.current = contentResponse.sequence;
if (contentResponse.content) {
  accumulatedContent += contentResponse.content;
}

// 修改后
currentSequenceRef.current = contentResponse.current_sequence;
if (contentResponse.chunks && contentResponse.chunks.length > 0) {
  for (const chunk of contentResponse.chunks) {
    accumulatedContent += chunk.delta;
  }
}
```

**后端响应格式**:
```rust
pub struct StreamingChunksResponse {
    pub context_id: String,
    pub message_id: String,
    pub chunks: Vec<ChunkDTO>,
    pub current_sequence: u64,
    pub has_more: bool,
}

pub struct ChunkDTO {
    pub sequence: u64,
    pub delta: String,
}
```

---

## 功能标志

**启用新架构**:
- 文件: `src/hooks/useChatManager.ts`
- 行号: 19
- 修改: `const USE_SIGNAL_PULL_SSE = true;`

---

## 后端端点总结

### Context API (`/v1/contexts/`)

| 端点 | 方法 | 用途 |
|------|------|------|
| `/contexts/{id}/events` | GET | SSE 订阅（Signal-Pull） |
| `/contexts/{id}/actions/send_message` | POST | 发送消息（非流式） |
| `/contexts/{id}/messages/{msg_id}/streaming-chunks` | GET | 拉取内容增量 |
| `/contexts/{id}` | GET | 获取上下文详情 |
| `/contexts/{id}/messages` | GET | 获取消息列表 |

### Chat API (`/v1/chat/`) - 旧架构（已废弃）

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/chat/{session_id}/stream` | POST | 流式发送消息 | ⚠️ 废弃 |
| `/chat/{session_id}` | POST | 非流式发送消息 | ⚠️ 废弃 |

---

## 测试验证

### 1. SSE 连接测试

```bash
# 应该看到 EventSource 连接
curl -N http://127.0.0.1:8080/v1/contexts/{context_id}/events
```

### 2. 发送消息测试

```bash
curl -X POST http://127.0.0.1:8080/v1/contexts/{context_id}/actions/send_message \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "type": "text",
      "content": "Hello",
      "display": null
    },
    "client_metadata": {}
  }'
```

### 3. 拉取内容测试

```bash
curl http://127.0.0.1:8080/v1/contexts/{context_id}/messages/{message_id}/streaming-chunks?from_sequence=0
```

**期望响应**:
```json
{
  "context_id": "...",
  "message_id": "...",
  "chunks": [
    {"sequence": 0, "delta": "Hello"},
    {"sequence": 1, "delta": " world"}
  ],
  "current_sequence": 1,
  "has_more": false
}
```

---

## 修复文件清单

| 文件 | 修改内容 | 行数 |
|------|----------|------|
| `src/hooks/useChatManager.ts` | 启用功能标志 | 1 |
| `src/hooks/useChatManager.ts` | 更新内容处理逻辑 | ~15 |
| `src/services/BackendContextService.ts` | 修复 SSE 端点 | 1 |
| `src/services/BackendContextService.ts` | 修复发送消息端点 | 1 |
| `src/services/BackendContextService.ts` | 修复内容拉取端点 | 2 |
| `src/services/BackendContextService.ts` | 更新日志输出 | 1 |
| `src/types/sse.ts` | 更新响应类型定义 | ~10 |

**总计**: 7 个文件，~31 行修改

---

## 下一步

1. **重启应用** - 前端和后端都需要重启
2. **清理数据** - 确保旧数据已清理（参考 `DATA_CLEANUP_GUIDE.md`）
3. **测试基本流程** - 按照 `TESTING_GUIDE.md` 进行测试
4. **验证端点** - 使用 DevTools Network 标签验证请求

---

## 常见问题

### Q: 为什么有两套 API（`/chat/` 和 `/contexts/`）？

A: 
- `/chat/` - 旧架构，基于 Session，使用流式 SSE
- `/contexts/` - 新架构，基于 Context，使用 Signal-Pull SSE
- 新架构更高效，后端是单一真相源

### Q: 什么时候移除旧的 `/chat/` API？

A: Phase 10 完成并验证后，会在 Phase 10 清理阶段移除（参考 `DEPRECATED.md`）

### Q: 如何切换回旧架构？

A: 设置 `USE_SIGNAL_PULL_SSE = false` 在 `src/hooks/useChatManager.ts`

---

**所有端点已修复！现在可以重启应用并开始测试了！** 🚀

