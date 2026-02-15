# 修复：Copilot 认证错误不显示在前端

## 问题描述

当 Copilot 未认证时，用户发送消息后：
- 前端一直显示 "Assistant is thinking..."
- 后端日志显示认证错误
- 前端没有收到错误事件，也没有显示错误消息

**后端日志：**
```
[agent_server::handlers::events] Found runner with status: Error("LLM error: ... Not authenticated...")
```

**前端表现：**
```
Assistant is thinking... (永远显示)
```

## 根本原因

`events` handler 只处理了 `Completed` 状态，没有处理 `Error` 状态：

```rust
// 只处理了 Completed 状态
if matches!(runner_status, Some(AgentStatus::Completed)) {
    // 发送 complete 事件
}
// Error 状态被忽略了，进入正常流式，但不会再有事件
```

当 runner 已经失败时：
1. 订阅 `events` 端点
2. 发现 runner 状态是 Error
3. 但代码没有发送错误事件
4. 进入正常流式循环 `while let Ok(event) = receiver.recv().await`
5. 但因为 runner 已失败，不会再发送事件
6. 前端永远收不到响应，一直显示 "thinking..."

## 解决方案

### 后端修复

**文件：** `crates/agent-server/src/handlers/events.rs`

添加对 `Error` 状态的处理，立即发送错误事件：

```rust
match runner_status {
    Some(AgentStatus::Completed) => {
        // 发送 complete 事件
    }
    Some(AgentStatus::Error(err)) => {
        // 新增：发送 error 事件
        return HttpResponse::Ok()
            .streaming(async_stream::stream! {
                let event = agent_core::AgentEvent::Error {
                    message: err.clone(),
                };
                // ... 发送 SSE
            });
    }
    _ => {
        // 正常运行状态，继续流式传输
    }
}
```

### 前端修复

**文件：** `src/services/chat/AgentService.ts`

1. 添加 `message` 字段到 AgentEvent 接口：
```typescript
export interface AgentEvent {
  // ...
  error?: string;
  message?: string; // For Error events
}
```

2. 更新错误处理，优先使用 `message` 字段：
```typescript
case "error":
  handlers.onError?.(event.message || event.error || "Unknown error");
  break;
```

## 关键改动

### Rust 后端

```rust
// Before
Some(receiver) => {
    if matches!(runner_status, Some(AgentStatus::Completed)) {
        // 处理 completed
    }
    // Error 状态被忽略！
}

// After
Some(receiver) => {
    match runner_status {
        Some(AgentStatus::Completed) => {
            // 处理 completed
        }
        Some(AgentStatus::Error(err)) => {
            // 立即发送 error 事件
            let event = agent_core::AgentEvent::Error {
                message: err.clone(),
            };
            // ...
        }
        _ => {
            // 正常运行状态
        }
    }
}
```

### TypeScript 前端

```typescript
// Before
export interface AgentEvent {
  error?: string;
}

handlers.onError?.(event.error || "Unknown error");

// After
export interface AgentEvent {
  error?: string;
  message?: string; // Error 事件使用这个字段
}

handlers.onError?.(event.message || event.error || "Unknown error");
```

## 现在的工作流程

### 1. 用户发送消息（未认证）
```
用户: "Hello"
  ↓
POST /api/v1/execute/{session_id}
  ↓
AgentRunner 启动
  ↓
调用 Copilot provider
  ↓
Copilot 返回认证错误
  ↓
Runner 状态变为 Error("Not authenticated...")
  ↓
POST /api/v1/events/{session_id} (SSE 订阅)
  ↓
events handler 检测到 Error 状态
  ↓
立即发送: { type: "error", message: "Not authenticated..." }
  ↓
前端 onError 回调触发
  ↓
显示: 🔐 Authentication Required + [Go to Settings]
```

### 2. 用户看到友好错误
```
┌──────────────────────────────────────┐
│ 🔐 Authentication Required           │
│                                      │
│ Copilot is not authenticated.        │
│ Please follow these steps:           │
│                                      │
│ 1. Go to Settings → Provider Settings│
│ 2. Select GitHub Copilot             │
│ 3. Click "Authenticate Copilot"      │
│                                      │
│ [Go to Settings]                     │
└──────────────────────────────────────┘
```

## 测试

### 步骤
1. 删除 Copilot 缓存 token
   ```bash
   rm ~/.bamboo/copilot_token.json
   ```

2. 重启应用

3. 发送消息

4. 预期结果
   - 立即显示认证错误消息
   - 有 "Go to Settings" 按钮
   - 不再显示 "thinking..."

## 相关文件

### 后端
- `crates/agent-server/src/handlers/events.rs`
  - 添加 `Error` 状态处理

### 前端
- `src/services/chat/AgentService.ts`
  - 添加 `message` 字段到 AgentEvent
  - 更新错误处理逻辑

## 编译验证

```bash
cargo build -p agent-server -p web_service
✅ Finished successfully
```

## 总结

| 问题 | 原因 | 解决 |
|------|------|------|
| 一直显示 "thinking..." | events handler 忽略了 Error 状态 | 添加 Error 状态处理，立即发送 error 事件 |
| 前端收不到错误 | AgentEvent 缺少 message 字段 | 添加 message 字段，优先使用 |

**关键洞察：** 状态机需要处理所有可能的终态（Completed, Error, Cancelled），不能漏掉任何一种情况。
