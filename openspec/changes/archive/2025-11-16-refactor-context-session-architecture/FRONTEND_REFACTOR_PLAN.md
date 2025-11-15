# 前端重构完整计划

## 目标

将前端从旧的流式架构迁移到新的 Signal-Pull SSE 架构，并建立完善的测试体系。

---

## 测试策略

### 原则

1. **测试优先** - 先写测试，再写实现
2. **自动化** - 所有测试都可以在 CI/CD 中运行
3. **分层测试** - Backend Integration → Frontend Unit → E2E
4. **高覆盖率** - 目标 80%+ 代码覆盖率

### 测试金字塔

```
        E2E Tests (10%)
       /              \
      /   Integration   \
     /    Tests (30%)    \
    /____________________\
    Unit Tests (60%)
```

---

## Phase 0: 测试基础设施 (1 day)

### 0.1 Backend Integration Tests

**目标**: 验证所有 API 端点和响应格式

**文件**: `crates/web_service/tests/context_api_integration_tests.rs`

**测试用例**:
```rust
// SSE 端点测试
#[actix_web::test]
async fn test_sse_subscription() {
    // 1. 创建 context
    // 2. 订阅 SSE /contexts/{id}/events
    // 3. 验证连接建立
    // 4. 验证心跳事件
}

// 发送消息端点测试
#[actix_web::test]
async fn test_send_message_action() {
    // 1. 创建 context
    // 2. POST /contexts/{id}/actions/send_message
    // 3. 验证响应格式
    // 4. 验证 context 状态变化
}

// 内容拉取端点测试
#[actix_web::test]
async fn test_streaming_chunks_pull() {
    // 1. 创建 context 和流式消息
    // 2. GET /contexts/{id}/messages/{msg_id}/streaming-chunks
    // 3. 验证响应格式 (chunks[], current_sequence, has_more)
    // 4. 测试增量拉取 (from_sequence 参数)
}

// 完整流程集成测试
#[actix_web::test]
async fn test_signal_pull_flow() {
    // 1. 创建 context
    // 2. 订阅 SSE
    // 3. 发送消息
    // 4. 接收 content_delta 事件
    // 5. 拉取内容
    // 6. 接收 message_completed 事件
    // 7. 验证最终状态
}
```

**任务清单**:
- [ ] 0.1.1 创建 `context_api_integration_tests.rs`
- [ ] 0.1.2 实现 SSE 订阅测试 (test_sse_subscription)
- [ ] 0.1.3 实现发送消息测试 (test_send_message_action)
- [ ] 0.1.4 实现内容拉取测试 (test_streaming_chunks_pull)
- [ ] 0.1.5 实现完整流程测试 (test_signal_pull_flow)
- [ ] 0.1.6 实现错误场景测试 (404, 500, timeout)
- [ ] 0.1.7 所有测试通过

---

### 0.2 Frontend Unit Test 基础设施

**目标**: 建立前端单元测试框架

**工具**: Vitest + React Testing Library

**配置文件**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
```

**任务清单**:
- [ ] 0.2.1 安装 Vitest 和 React Testing Library
- [ ] 0.2.2 创建 `vitest.config.ts`
- [ ] 0.2.3 创建 `src/test/setup.ts` (mock EventSource, fetch)
- [ ] 0.2.4 创建 `src/test/helpers.ts` (测试工具函数)
- [ ] 0.2.5 添加 npm scripts (`test`, `test:coverage`)

---

### 0.3 E2E Test 基础设施

**目标**: 建立端到端测试框架

**工具**: Playwright

**配置文件**: `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:1420', // Tauri dev server
  },
  webServer: {
    command: 'npm run tauri dev',
    port: 1420,
    reuseExistingServer: !process.env.CI,
  },
});
```

**任务清单**:
- [ ] 0.3.1 安装 Playwright
- [ ] 0.3.2 创建 `playwright.config.ts`
- [ ] 0.3.3 创建 `e2e/` 目录
- [ ] 0.3.4 创建 `e2e/helpers.ts` (测试工具函数)
- [ ] 0.3.5 添加 npm scripts (`test:e2e`)

---

## Phase 1: Backend Service Layer (1 day)

### 1.1 实现 BackendContextService

**文件**: `src/services/BackendContextService.ts`

**任务清单**:
- [ ] 1.1.1 查看后端端点定义
  - [ ] 查看 `context_controller.rs` 所有路由
  - [ ] 记录端点路径和方法
  - [ ] 记录请求/响应格式
- [ ] 1.1.2 实现 `subscribeToContextEvents`
  - [ ] 使用 `/contexts/{id}/events` 端点
  - [ ] 实现 EventSource 连接
  - [ ] 实现事件解析
  - [ ] 实现错误处理和重连
- [ ] 1.1.3 实现 `sendMessage`
  - [ ] 使用 `/contexts/{id}/actions/send_message` 端点
  - [ ] 实现请求格式化
  - [ ] 实现错误处理
- [ ] 1.1.4 实现 `getMessageContent`
  - [ ] 使用 `/contexts/{id}/messages/{msg_id}/streaming-chunks` 端点
  - [ ] 支持 `from_sequence` 参数
  - [ ] 实现响应解析

---

### 1.2 添加 TypeScript 类型

**文件**: `src/types/sse.ts`

**任务清单**:
- [ ] 1.2.1 查看后端类型定义
  - [ ] 查看 `context_controller.rs` SignalEvent 定义
  - [ ] 查看 StreamingChunksResponse 定义
  - [ ] 记录所有字段和类型
- [ ] 1.2.2 创建前端类型定义
  - [ ] SignalEvent 类型
  - [ ] MessageContentResponse 类型
  - [ ] 验证类型匹配

---

### 1.3 Frontend Unit Tests

**文件**: `src/services/__tests__/BackendContextService.test.ts`

**测试用例**:
```typescript
describe('BackendContextService', () => {
  describe('subscribeToContextEvents', () => {
    it('should establish SSE connection', () => {
      // Mock EventSource
      // Call subscribeToContextEvents
      // Verify EventSource created with correct URL
    });

    it('should parse content_delta events', () => {
      // Mock EventSource with content_delta event
      // Verify onEvent callback called with correct data
    });

    it('should handle connection errors', () => {
      // Mock EventSource error
      // Verify onError callback called
    });

    it('should cleanup on unsubscribe', () => {
      // Subscribe and then unsubscribe
      // Verify EventSource.close() called
    });
  });

  describe('sendMessage', () => {
    it('should send message with correct format', async () => {
      // Mock fetch
      // Call sendMessage
      // Verify request URL and body
    });

    it('should handle API errors', async () => {
      // Mock fetch with error response
      // Verify error thrown
    });
  });

  describe('getMessageContent', () => {
    it('should pull content with sequence', async () => {
      // Mock fetch with chunks response
      // Call getMessageContent with from_sequence
      // Verify request URL includes from_sequence
      // Verify response parsed correctly
    });

    it('should handle empty chunks', async () => {
      // Mock fetch with empty chunks
      // Verify response handled correctly
    });
  });
});
```

**任务清单**:
- [ ] 1.3.1 创建测试文件
- [ ] 1.3.2 实现 subscribeToContextEvents 测试 (4 个)
- [ ] 1.3.3 实现 sendMessage 测试 (2 个)
- [ ] 1.3.4 实现 getMessageContent 测试 (2 个)
- [ ] 1.3.5 所有测试通过
- [ ] 1.3.6 代码覆盖率 > 80%

---

### 1.4 Backend Integration Tests 验证

**任务清单**:
- [ ] 1.4.1 运行 Backend Integration Tests
- [ ] 1.4.2 验证所有端点测试通过
- [ ] 1.4.3 验证响应格式正确
- [ ] 1.4.4 记录测试结果

---

## Phase 2: XState Machine Update (1 day)

### 2.1 实现 contextStream Actor

**文件**: `src/core/chatInteractionMachine.ts`

**任务清单**:
- [ ] 2.1.1 创建 contextStream actor
  - [ ] 实现 SSE 订阅逻辑
  - [ ] 实现事件处理 (content_delta, message_completed, state_changed)
  - [ ] 实现内容拉取逻辑
  - [ ] 实现序列号追踪
- [ ] 2.1.2 更新 machine context
  - [ ] 添加 currentContextId
  - [ ] 添加 currentSequence
  - [ ] 添加 currentMessageId
- [ ] 2.1.3 集成到 THINKING 状态
  - [ ] 替换 aiStream 为 contextStream
  - [ ] 更新状态转换逻辑

---

### 2.2 Frontend Unit Tests

**文件**: `src/core/__tests__/chatInteractionMachine.test.ts`

**测试用例**:
```typescript
describe('chatInteractionMachine', () => {
  describe('contextStream actor', () => {
    it('should subscribe to SSE on start', () => {
      // Start machine with THINKING state
      // Verify subscribeToContextEvents called
    });

    it('should handle content_delta events', async () => {
      // Mock SSE content_delta event
      // Verify getMessageContent called
      // Verify content accumulated
    });

    it('should handle message_completed events', async () => {
      // Mock SSE message_completed event
      // Verify final state fetched
      // Verify state transition to IDLE
    });

    it('should cleanup on stop', () => {
      // Start and stop machine
      // Verify SSE unsubscribe called
    });
  });
});
```

**任务清单**:
- [ ] 2.2.1 创建测试文件
- [ ] 2.2.2 实现 contextStream actor 测试 (4 个)
- [ ] 2.2.3 实现状态转换测试 (3 个)
- [ ] 2.2.4 所有测试通过
- [ ] 2.2.5 代码覆盖率 > 80%

---

## Phase 3: Hook Integration (1 day)

### 3.1 更新 useChatManager

**文件**: `src/hooks/useChatManager.ts`

**任务清单**:
- [ ] 3.1.1 实现新的 sendMessage 流程
  - [ ] 调用 sendMessage API
  - [ ] 订阅 SSE 事件
  - [ ] 处理 content_delta 事件
  - [ ] 处理 message_completed 事件
  - [ ] 更新 UI 状态
- [ ] 3.1.2 实现 SSE 清理逻辑
  - [ ] 在 unmount 时清理
  - [ ] 在切换聊天时清理
- [ ] 3.1.3 实现错误处理
  - [ ] SSE 连接错误
  - [ ] API 调用错误
  - [ ] 超时处理

---

### 3.2 Frontend Unit Tests

**文件**: `src/hooks/__tests__/useChatManager.test.ts`

**测试用例**:
```typescript
describe('useChatManager', () => {
  describe('sendMessage with Signal-Pull SSE', () => {
    it('should send message and subscribe to SSE', async () => {
      // Render hook
      // Call sendMessage
      // Verify sendMessage API called
      // Verify subscribeToContextEvents called
    });

    it('should handle content_delta events', async () => {
      // Mock SSE content_delta event
      // Verify getMessageContent called
      // Verify message content updated in UI
    });

    it('should handle message_completed events', async () => {
      // Mock SSE message_completed event
      // Verify final messages fetched
      // Verify SSE unsubscribed
    });

    it('should cleanup SSE on chat switch', async () => {
      // Subscribe to SSE
      // Switch to different chat
      // Verify SSE unsubscribed
    });

    it('should handle SSE errors', async () => {
      // Mock SSE error
      // Verify error message shown
      // Verify SSE reconnection attempted
    });
  });
});
```

**任务清单**:
- [ ] 3.2.1 创建测试文件
- [ ] 3.2.2 实现 sendMessage 测试 (5 个)
- [ ] 3.2.3 实现 SSE 清理测试 (2 个)
- [ ] 3.2.4 实现错误处理测试 (3 个)
- [ ] 3.2.5 所有测试通过
- [ ] 3.2.6 代码覆盖率 > 80%

---

## Phase 4: E2E Tests (1 day)

### 4.1 基本流程 E2E Tests

**文件**: `e2e/chat-basic-flow.spec.ts`

**测试用例**:
```typescript
test.describe('Chat Basic Flow', () => {
  test('should send and receive message', async ({ page }) => {
    // 1. 打开应用
    // 2. 创建新聊天
    // 3. 发送消息 "Hello"
    // 4. 等待 AI 回复
    // 5. 验证消息显示在 UI
  });

  test('should stream message content', async ({ page }) => {
    // 1. 发送消息
    // 2. 监听 DOM 变化
    // 3. 验证内容逐步显示（流式效果）
  });

  test('should handle multiple messages', async ({ page }) => {
    // 1. 发送 3 条消息
    // 2. 验证所有消息都正确显示
    // 3. 验证消息顺序正确
  });
});
```

**任务清单**:
- [ ] 4.1.1 创建测试文件
- [ ] 4.1.2 实现基本消息发送测试
- [ ] 4.1.3 实现流式显示测试
- [ ] 4.1.4 实现多消息测试
- [ ] 4.1.5 所有测试通过

---

### 4.2 高级功能 E2E Tests

**文件**: `e2e/chat-advanced-flow.spec.ts`

**测试用例**:
```typescript
test.describe('Chat Advanced Flow', () => {
  test('should handle chat switching', async ({ page }) => {
    // 1. 创建聊天 A
    // 2. 发送消息
    // 3. 创建聊天 B
    // 4. 切换回聊天 A
    // 5. 验证消息历史正确
  });

  test('should handle tool calls', async ({ page }) => {
    // 1. 发送需要工具调用的消息
    // 2. 等待工具执行
    // 3. 验证工具结果显示
  });

  test('should handle errors gracefully', async ({ page }) => {
    // 1. 模拟后端错误
    // 2. 发送消息
    // 3. 验证错误提示显示
    // 4. 验证 UI 保持响应
  });
});
```

**任务清单**:
- [ ] 4.2.1 创建测试文件
- [ ] 4.2.2 实现聊天切换测试
- [ ] 4.2.3 实现工具调用测试
- [ ] 4.2.4 实现错误处理测试
- [ ] 4.2.5 所有测试通过

---

### 4.3 性能 E2E Tests

**文件**: `e2e/chat-performance.spec.ts`

**测试用例**:
```typescript
test.describe('Chat Performance', () => {
  test('should handle long conversations', async ({ page }) => {
    // 1. 发送 50 条消息
    // 2. 测量响应时间
    // 3. 验证内存使用
  });

  test('should handle concurrent chats', async ({ page }) => {
    // 1. 创建 5 个聊天
    // 2. 在每个聊天中发送消息
    // 3. 验证所有聊天正常工作
  });
});
```

**任务清单**:
- [ ] 4.3.1 创建测试文件
- [ ] 4.3.2 实现长对话测试
- [ ] 4.3.3 实现并发聊天测试
- [ ] 4.3.4 所有测试通过

---

## Phase 5: 代码清理和文档 (0.5 day)

### 5.1 移除废弃代码

**任务清单**:
- [ ] 5.1.1 移除 AIService 类（或标记为 deprecated）
- [ ] 5.1.2 移除 sendMessageStream 方法
- [ ] 5.1.3 移除 aiStream actor
- [ ] 5.1.4 移除未使用的 imports
- [ ] 5.1.5 更新所有注释

---

### 5.2 更新文档

**任务清单**:
- [ ] 5.2.1 更新 FRONTEND_MIGRATION_PLAN.md
- [ ] 5.2.2 创建 TESTING_GUIDE.md（测试运行指南）
- [ ] 5.2.3 更新 README.md（添加测试说明）
- [ ] 5.2.4 创建 API_REFERENCE.md（前端 API 文档）

---

## 测试覆盖率目标

| 层级 | 目标覆盖率 | 测试数量 |
|------|-----------|---------|
| Backend Integration | 100% | 10+ |
| Frontend Unit | 80%+ | 30+ |
| E2E | 核心流程 | 15+ |

---

## 成功标准

- [ ] 所有 Backend Integration Tests 通过
- [ ] 所有 Frontend Unit Tests 通过
- [ ] 所有 E2E Tests 通过
- [ ] 代码覆盖率 > 80%
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告
- [ ] 所有文档更新完成

---

## 时间估算

| Phase | 时间 | 累计 |
|-------|------|------|
| Phase 0: 测试基础设施 | 1 day | 1 day |
| Phase 1: Backend Service Layer | 1 day | 2 days |
| Phase 2: XState Machine Update | 1 day | 3 days |
| Phase 3: Hook Integration | 1 day | 4 days |
| Phase 4: E2E Tests | 1 day | 5 days |
| Phase 5: 清理和文档 | 0.5 day | 5.5 days |

**总计**: 5.5 天（约 1 周）

---

## 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 后端 API 变更 | 高 | Backend Integration Tests 及早发现 |
| 测试环境配置复杂 | 中 | 详细的配置文档和脚本 |
| E2E 测试不稳定 | 中 | 添加重试机制和等待策略 |
| 时间估算不准 | 低 | 每个 Phase 完成后重新评估 |

---

## 下一步

1. **Review 这个计划** - 确认测试策略和时间估算
2. **开始 Phase 0** - 建立测试基础设施
3. **逐步推进** - 每个 Phase 完成后 review 和调整

**准备好开始了吗？** 🚀

