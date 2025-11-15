# 测试实施计划

## 现状分析

### ✅ 已有的测试基础设施

1. **Vitest** - 前端单元测试框架已安装
2. **Backend Unit Tests** - 110+ 测试，覆盖核心逻辑
3. **Backend Integration Tests** - `signal_pull_integration_tests.rs` 测试流式响应生命周期

### ✅ 已完成的测试

1. **Backend HTTP API Integration Tests** - ✅ 9 个测试，100% 通过

### ❌ 缺失的测试

1. **Frontend Unit Tests** - 0 个测试
2. **E2E Tests** - 没有 E2E 测试框架

---

## 测试策略

### 测试金字塔

```
        E2E Tests (10%)
       /              \
      /   HTTP API      \
     /  Integration (20%) \
    /____________________\
    Unit Tests (70%)
```

### 优先级

1. **P0 (Critical)**: Backend HTTP API Integration Tests - 验证端点和格式
2. **P1 (High)**: Frontend Unit Tests - 验证 Service/Hook 逻辑
3. **P2 (Medium)**: E2E Tests - 验证完整用户流程

---

## Phase 0: Backend HTTP API Integration Tests (P0) ✅ COMPLETED

### 目标

验证所有 HTTP API 端点的路径、请求格式、响应格式都正确。

### 状态

**✅ 已完成** - 2024-11-09

- **测试文件**: `crates/web_service/tests/http_api_integration_tests.rs` (457 lines)
- **测试数量**: 9 个集成测试
- **测试结果**: 9/9 通过 (100%)
- **代码覆盖**: 覆盖所有核心 HTTP API 端点

### 实现的测试用例

1. ✅ `test_context_metadata_endpoint` - 测试 GET /v1/contexts/{id}/metadata
2. ✅ `test_context_state_endpoint` - 测试 GET /v1/contexts/{id}/state
3. ✅ `test_send_message_endpoint` - 测试 POST /v1/contexts/{id}/actions/send_message
4. ✅ `test_send_message_validation` - 测试消息验证逻辑
5. ✅ `test_send_message_404_for_nonexistent_context` - 测试 404 错误处理
6. ✅ `test_sse_subscription_endpoint` - 测试 GET /v1/contexts/{id}/events (SSE)
7. ✅ `test_sse_endpoint_404_for_nonexistent_context` - 测试 SSE 404 错误
8. ✅ `test_streaming_chunks_endpoint` - 测试 GET /v1/contexts/{id}/messages/{msg_id}/streaming-chunks
9. ✅ `test_streaming_chunks_404_for_nonexistent_message` - 测试 streaming chunks 404 错误

### 关键修复

**Round 1-5 迭代修复**:
1. **MockCopilotClient** - 使用 wiremock 创建真实的 HTTP mock server
2. **AppError::NotFound** - 添加 404 错误类型和 ResponseError trait 实现
3. **Streaming Chunks** - 修复 `chat_service.rs` 使用 `begin_streaming_llm_response()` 和 `append_streaming_chunk()` 来创建 `StreamingResponse` 类型消息
4. **ChatCompletionStreamChunk** - MockCopilotClient 发送正确格式的 JSON streaming chunks
5. **Doctest 修复** - 更新 4 个文档测试以匹配当前 API

### 文件

`crates/web_service/tests/http_api_integration_tests.rs`

### 测试用例

```rust
use actix_web::{test, web, App};
use web_service::controllers::context_controller;
use web_service::AppState;

#[actix_web::test]
async fn test_sse_subscription_endpoint() {
    // Setup: Create test app with AppState
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state))
            .service(context_controller::subscribe_context_events)
    ).await;

    // Test: Subscribe to SSE
    let req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/events", context_id))
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    
    // Verify: Status 200, Content-Type text/event-stream
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.headers().get("content-type").unwrap(), "text/event-stream");
}

#[actix_web::test]
async fn test_send_message_endpoint() {
    // Setup: Create context
    let context_id = create_test_context(&app_state).await;
    
    // Test: Send message
    let req = test::TestRequest::post()
        .uri(&format!("/v1/contexts/{}/actions/send_message", context_id))
        .set_json(&json!({
            "payload": {
                "type": "text",
                "content": "Hello"
            }
        }))
        .to_request();
    
    let resp = test::call_service(&app, req).await;
    
    // Verify: Status 200, response format
    assert_eq!(resp.status(), 200);
}

#[actix_web::test]
async fn test_streaming_chunks_endpoint() {
    // Setup: Create context with streaming message
    let (context_id, message_id) = create_test_streaming_message(&app_state).await;
    
    // Test: Pull chunks
    let req = test::TestRequest::get()
        .uri(&format!("/v1/contexts/{}/messages/{}/streaming-chunks?from_sequence=0", 
                      context_id, message_id))
        .to_request();
    
    let resp: StreamingChunksResponse = test::call_and_read_body_json(&app, req).await;
    
    // Verify: Response format
    assert_eq!(resp.context_id, context_id.to_string());
    assert_eq!(resp.message_id, message_id.to_string());
    assert!(!resp.chunks.is_empty());
    assert_eq!(resp.chunks[0].sequence, 1);
    assert!(!resp.chunks[0].delta.is_empty());
}

#[actix_web::test]
async fn test_complete_signal_pull_flow() {
    // Setup: Create context
    let context_id = create_test_context(&app_state).await;
    
    // Step 1: Subscribe to SSE (in background)
    let sse_handle = tokio::spawn(async move {
        // Subscribe and collect events
    });
    
    // Step 2: Send message
    send_message(&app, context_id, "Hello").await;
    
    // Step 3: Wait for content_delta event
    let events = sse_handle.await.unwrap();
    assert!(events.iter().any(|e| e.event_type == "content_delta"));
    
    // Step 4: Pull content
    let chunks = get_streaming_chunks(&app, context_id, message_id, 0).await;
    assert!(!chunks.is_empty());
    
    // Step 5: Wait for message_completed event
    assert!(events.iter().any(|e| e.event_type == "message_completed"));
}
```

### 任务清单

- [ ] 0.1 创建 `http_api_integration_tests.rs`
- [ ] 0.2 实现测试辅助函数
  - [ ] `create_test_app_state()` - 创建测试用的 AppState
  - [ ] `create_test_context()` - 创建测试 context
  - [ ] `create_test_streaming_message()` - 创建流式消息
- [ ] 0.3 实现 SSE 端点测试
  - [ ] `test_sse_subscription_endpoint()` - 验证 `/events` 端点
  - [ ] `test_sse_heartbeat()` - 验证心跳事件
  - [ ] `test_sse_reconnection()` - 验证重连机制
- [ ] 0.4 实现发送消息端点测试
  - [ ] `test_send_message_endpoint()` - 验证 `/actions/send_message` 端点
  - [ ] `test_send_message_validation()` - 验证请求格式验证
  - [ ] `test_send_message_error_handling()` - 验证错误处理
- [ ] 0.5 实现内容拉取端点测试
  - [ ] `test_streaming_chunks_endpoint()` - 验证 `/streaming-chunks` 端点
  - [ ] `test_streaming_chunks_pagination()` - 验证 `from_sequence` 参数
  - [ ] `test_streaming_chunks_response_format()` - 验证响应格式
- [ ] 0.6 实现完整流程测试
  - [ ] `test_complete_signal_pull_flow()` - 验证完整的 Signal-Pull 流程
  - [ ] `test_concurrent_messages()` - 验证并发消息处理
  - [ ] `test_error_recovery()` - 验证错误恢复
- [ ] 0.7 运行所有测试
  - [ ] `cargo test http_api_integration_tests` 全部通过
  - [ ] 记录测试结果到文档

### 预期结果

- ✅ 所有 HTTP API 端点路径正确
- ✅ 所有请求/响应格式正确
- ✅ 完整的 Signal-Pull 流程工作正常
- ✅ 错误处理正确

---

## Phase 1: Frontend Unit Tests (P1)

### 目标

验证前端 Service 和 Hook 的逻辑正确性。

### 1.1 配置 Vitest

**文件**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src-tauri/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**任务清单**:
- [ ] 1.1.1 创建 `vitest.config.ts`
- [ ] 1.1.2 创建 `src/test/setup.ts` (mock EventSource, fetch)
- [ ] 1.1.3 创建 `src/test/helpers.ts` (测试工具函数)
- [ ] 1.1.4 更新 `package.json` scripts
  ```json
  {
    "scripts": {
      "test": "vitest",
      "test:ui": "vitest --ui",
      "test:coverage": "vitest --coverage"
    }
  }
  ```
- [ ] 1.1.5 安装依赖
  ```bash
  npm install -D @vitest/ui @vitest/coverage-v8 jsdom
  npm install -D @testing-library/react @testing-library/jest-dom
  npm install -D @testing-library/user-event
  ```

---

### 1.2 BackendContextService Tests

**文件**: `src/services/__tests__/BackendContextService.test.ts`

**测试用例**: 15 个

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackendContextService } from '../BackendContextService';

describe('BackendContextService', () => {
  let service: BackendContextService;
  let mockEventSource: any;

  beforeEach(() => {
    service = new BackendContextService();
    // Mock EventSource
    mockEventSource = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };
    global.EventSource = vi.fn(() => mockEventSource) as any;
  });

  describe('subscribeToContextEvents', () => {
    it('should create EventSource with correct URL', () => {
      const contextId = 'test-context-id';
      service.subscribeToContextEvents(contextId, vi.fn());
      
      expect(global.EventSource).toHaveBeenCalledWith(
        expect.stringContaining(`/contexts/${contextId}/events`)
      );
    });

    it('should parse content_delta events', () => {
      const onEvent = vi.fn();
      service.subscribeToContextEvents('test-id', onEvent);
      
      const eventHandler = mockEventSource.addEventListener.mock.calls
        .find(([type]) => type === 'content_delta')[1];
      
      eventHandler({ data: JSON.stringify({
        message_id: 'msg-1',
        sequence: 1,
      })});
      
      expect(onEvent).toHaveBeenCalledWith({
        event_type: 'content_delta',
        message_id: 'msg-1',
        sequence: 1,
      });
    });

    // ... 更多测试
  });

  describe('sendMessage', () => {
    it('should send POST request to correct endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await service.sendMessage('context-id', 'Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/context-id/actions/send_message'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello'),
        })
      );
    });

    // ... 更多测试
  });

  describe('getMessageContent', () => {
    it('should pull chunks with from_sequence parameter', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chunks: [{ sequence: 1, delta: 'Hello' }],
          current_sequence: 1,
          has_more: false,
        }),
      });

      const result = await service.getMessageContent(
        'context-id',
        'message-id',
        0
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('from_sequence=0'),
        expect.any(Object)
      );
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].delta).toBe('Hello');
    });

    // ... 更多测试
  });
});
```

**任务清单**:
- [ ] 1.2.1 创建测试文件
- [ ] 1.2.2 实现 subscribeToContextEvents 测试 (5 个)
- [ ] 1.2.3 实现 sendMessage 测试 (3 个)
- [ ] 1.2.4 实现 getMessageContent 测试 (4 个)
- [ ] 1.2.5 实现错误处理测试 (3 个)
- [ ] 1.2.6 所有测试通过
- [ ] 1.2.7 代码覆盖率 > 80%

---

### 1.3 useChatManager Tests

**文件**: `src/hooks/__tests__/useChatManager.test.ts`

**测试用例**: 20 个

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useChatManager } from '../useChatManager';

describe('useChatManager with Signal-Pull SSE', () => {
  beforeEach(() => {
    // Mock BackendContextService
    vi.mock('@/services/BackendContextService');
  });

  describe('sendMessage', () => {
    it('should send message and subscribe to SSE', async () => {
      const { result } = renderHook(() => useChatManager());
      
      await act(async () => {
        await result.current.handleSubmit('Hello');
      });

      // Verify sendMessage called
      expect(mockBackendService.sendMessage).toHaveBeenCalledWith(
        expect.any(String),
        'Hello'
      );
      
      // Verify SSE subscription
      expect(mockBackendService.subscribeToContextEvents).toHaveBeenCalled();
    });

    it('should handle content_delta events', async () => {
      const { result } = renderHook(() => useChatManager());
      
      // Send message
      await act(async () => {
        await result.current.handleSubmit('Hello');
      });

      // Simulate content_delta event
      const onEvent = mockBackendService.subscribeToContextEvents.mock.calls[0][1];
      await act(async () => {
        onEvent({
          event_type: 'content_delta',
          message_id: 'msg-1',
          sequence: 1,
        });
      });

      // Verify getMessageContent called
      expect(mockBackendService.getMessageContent).toHaveBeenCalledWith(
        expect.any(String),
        'msg-1',
        0
      );

      // Verify message content updated
      await waitFor(() => {
        expect(result.current.messages).toContainEqual(
          expect.objectContaining({
            id: 'msg-1',
            content: expect.stringContaining('Hello'),
          })
        );
      });
    });

    // ... 更多测试
  });

  describe('SSE cleanup', () => {
    it('should cleanup SSE on unmount', async () => {
      const { result, unmount } = renderHook(() => useChatManager());
      
      await act(async () => {
        await result.current.handleSubmit('Hello');
      });

      const unsubscribe = mockBackendService.subscribeToContextEvents.mock.results[0].value;
      
      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });

    // ... 更多测试
  });
});
```

**任务清单**:
- [ ] 1.3.1 创建测试文件
- [ ] 1.3.2 实现 sendMessage 测试 (8 个)
- [ ] 1.3.3 实现 SSE 事件处理测试 (6 个)
- [ ] 1.3.4 实现 SSE 清理测试 (3 个)
- [ ] 1.3.5 实现错误处理测试 (3 个)
- [ ] 1.3.6 所有测试通过
- [ ] 1.3.7 代码覆盖率 > 80%

---

### 1.4 运行所有前端测试

**任务清单**:
- [ ] 1.4.1 运行 `npm run test`
- [ ] 1.4.2 所有测试通过
- [ ] 1.4.3 运行 `npm run test:coverage`
- [ ] 1.4.4 代码覆盖率 > 80%
- [ ] 1.4.5 记录测试结果到文档

---

## Phase 2: E2E Tests (P2)

### 目标

验证完整的用户流程。

### 2.1 配置 Playwright

**文件**: `playwright.config.ts` (⚠️ **已移除** - Playwright 已从项目中清理)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run tauri dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

**任务清单**:
- [x] ~~2.1.1 安装 Playwright: `npm install -D @playwright/test`~~ (已清理)
- [x] ~~2.1.2 创建 `playwright.config.ts`~~ (已移除)
- [ ] 2.1.3 创建 `e2e/` 目录
- [ ] 2.1.4 创建 `e2e/helpers.ts`
- [ ] 2.1.5 更新 `package.json` scripts
  ```json
  {
    "scripts": {
      "test:e2e": "playwright test",
      "test:e2e:ui": "playwright test --ui"
    }
  }
  ```

---

### 2.2 基本流程 E2E Tests

**文件**: `e2e/chat-basic-flow.spec.ts`

**测试用例**: 5 个

```typescript
import { test, expect } from '@playwright/test';

test.describe('Chat Basic Flow', () => {
  test('should send and receive message', async ({ page }) => {
    await page.goto('/');
    
    // Create new chat
    await page.click('[data-testid="new-chat-button"]');
    
    // Send message
    await page.fill('[data-testid="message-input"]', 'Hello');
    await page.press('[data-testid="message-input"]', 'Enter');
    
    // Wait for AI response
    await expect(page.locator('[data-testid="message-list"]'))
      .toContainText('Hello', { timeout: 10000 });
    
    // Verify streaming effect (content appears gradually)
    await expect(page.locator('[data-testid="ai-message"]'))
      .toBeVisible({ timeout: 5000 });
  });

  // ... 更多测试
});
```

**任务清单**:
- [ ] 2.2.1 创建测试文件
- [ ] 2.2.2 实现基本消息发送测试
- [ ] 2.2.3 实现流式显示测试
- [ ] 2.2.4 实现多消息测试
- [ ] 2.2.5 实现聊天切换测试
- [ ] 2.2.6 所有测试通过

---

## 测试覆盖率目标

| 层级                         | 目标覆盖率 | 测试数量 | 状态      |
| ---------------------------- | ---------- | -------- | --------- |
| Backend Unit                 | 80%+       | 110+     | ✅ 已完成  |
| Backend HTTP API Integration | 100%       | 15+      | ⏳ Phase 0 |
| Frontend Unit                | 80%+       | 35+      | ⏳ Phase 1 |
| E2E                          | 核心流程   | 10+      | ⏳ Phase 2 |

---

## 时间估算

| Phase                                       | 时间     | 累计     |
| ------------------------------------------- | -------- | -------- |
| Phase 0: Backend HTTP API Integration Tests | 1 day    | 1 day    |
| Phase 1: Frontend Unit Tests                | 1.5 days | 2.5 days |
| Phase 2: E2E Tests                          | 1 day    | 3.5 days |

**总计**: 3.5 天

---

## 成功标准

- [ ] 所有 Backend HTTP API Integration Tests 通过 (15+)
- [ ] 所有 Frontend Unit Tests 通过 (35+)
- [ ] 所有 E2E Tests 通过 (10+)
- [ ] Backend 代码覆盖率 > 80%
- [ ] Frontend 代码覆盖率 > 80%
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告

---

## 下一步

1. **Review 这个计划** - 确认优先级和时间估算
2. **开始 Phase 0** - Backend HTTP API Integration Tests (最关键)
3. **逐步推进** - 每个 Phase 完成后 review

**准备好开始 Phase 0 了吗？** 🚀

