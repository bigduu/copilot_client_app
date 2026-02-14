# TodoList V2 设计文档

## 设计目标

1. 解决当前重试日志太多的问题
2. 将 TodoList 存储在 Session 中，类似 Token Budget
3. 采用类似 Token Budget 的 SSE 更新机制
4. 优化前端状态管理

## 参考 Token Budget 的设计模式

### Token Budget 的核心机制

```
┌─────────────────────────────────────────────────────────────────┐
│                    Token Budget 数据流                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Event 发送                                                   │
│     Agent Loop ──▶ event_tx.send(TokenBudgetUpdated)             │
│                  └── 同时保存到 session.token_usage              │
│                                                                 │
│  2. Event 重放                                                   │
│     AgentRunner.last_budget_event 存储最新事件                   │
│     └── 新订阅者连接时立即重放                                   │
│                                                                 │
│  3. 前端状态管理                                                 │
│     useAgentEventSubscription ──▶ Zustand Store (实时)           │
│                              └──▶ Chat Config (持久化)          │
│                                                                 │
│  4. 页面刷新恢复                                                 │
│     Chat Config ──▶ Zustand Store ──▶ UI                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## TodoList V2 架构设计

### 1. 后端设计

#### 1.1 Session 结构修改

```rust
// crates/agent-core/src/agent/types.rs
pub struct Session {
    // ... existing fields ...

    /// Token budget configuration for this session
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_budget: Option<crate::budget::TokenBudget>,

    /// Last token usage information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<crate::agent::events::TokenBudgetUsage>,

    /// Todo list for task tracking (NEW)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todo_list: Option<crate::todo::TodoList>,

    /// Todo list generation/last update timestamp (NEW)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub todo_list_updated_at: Option<DateTime<Utc>>,
}
```

#### 1.2 Event 类型优化

```rust
// crates/agent-core/src/agent/events.rs

/// Todo list update event - 简化版，用于增量更新
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoListDelta {
    /// Session ID
    pub session_id: String,
    /// Full items list (can be optimized to delta in future)
    pub items: Vec<TodoItem>,
    /// Current status
    pub status: TodoListStatus,
    /// Progress percentage
    pub progress_percentage: u8,
    /// Version number for conflict detection
    pub version: u64,
    /// Update timestamp
    pub updated_at: DateTime<Utc>,
}

pub enum AgentEvent {
    // ... existing events ...

    /// Full todo list update (for initial load or major changes)
    TodoListUpdated {
        todo_list: TodoList,
    },

    /// Delta update (for incremental changes - NEW)
    TodoListDelta {
        delta: TodoListDelta,
    },

    /// Todo list completed (NEW)
    TodoListCompleted {
        session_id: String,
        completed_at: DateTime<Utc>,
    },
}
```

#### 1.3 AgentRunner 存储优化

```rust
// crates/agent-server/src/state.rs

pub struct AgentRunner {
    pub event_sender: broadcast::Sender<AgentEvent>,
    pub cancel_token: CancellationToken,
    pub status: AgentStatus,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,

    /// Last token budget event to replay for late subscribers
    pub last_budget_event: Option<AgentEvent>,

    /// Last todo list event to replay for late subscribers (NEW)
    pub last_todo_list_event: Option<AgentEvent>,

    /// Todo list generation counter (for deduplication) (NEW)
    pub todo_list_generation: u64,
}
```

#### 1.4 事件发送逻辑优化

```rust
// crates/agent-loop/src/runner.rs

// 在 create_todo_list 工具调用成功后
if tool_call.function.name == "create_todo_list" {
    if let Some(todo_list) = session.todo_list.clone() {
        // 1. 更新 session 中的 todo_list
        session.todo_list = Some(todo_list.clone());
        session.todo_list_updated_at = Some(Utc::now());

        // 2. 立即保存 session（关键事件立即保存）
        if let Some(storage) = &storage {
            if let Err(e) = storage.save_session(session).await {
                log::warn!("[{}] Failed to save session with todo list: {}", session_id, e);
            }
        }

        // 3. 发送事件（非阻塞）
        let event = AgentEvent::TodoListUpdated { todo_list };
        let _ = event_tx.send(event).await;
    }
}

// 在 update_todo_item 工具调用成功后
if tool_call.function.name == "update_todo_item" && result.success {
    // 只更新不保存（延迟保存策略）
    if let Some(todo_list) = session.todo_list.as_mut() {
        // ... 更新逻辑 ...
        todo_list.version += 1;
        todo_list.updated_at = Utc::now();
        session.todo_list_updated_at = Some(Utc::now());

        // 发送 Delta 事件（更轻量）
        let delta = TodoListDelta {
            session_id: session_id.clone(),
            items: todo_list.items.clone(),
            status: todo_list.status.clone(),
            progress_percentage: todo_list.progress(),
            version: todo_list.version,
            updated_at: todo_list.updated_at,
        };

        let event = AgentEvent::TodoListDelta { delta };
        let _ = event_tx.send(event).await;

        // 标记 session 为 dirty，由后台任务保存
        session.dirty = true;
    }
}
```

#### 1.5 事件转发器优化

```rust
// crates/agent-server/src/handlers/execute.rs

// Event forwarder: mpsc -> broadcast
tokio::spawn(async move {
    while let Some(event) = mpsc_rx.recv().await {
        // Store budget events for late subscribers
        if matches!(&event, agent_core::AgentEvent::TokenBudgetUpdated { .. }) {
            let mut runners = state_for_forwarder.agent_runners.write().await;
            if let Some(runner) = runners.get_mut(&session_id_forwarder) {
                runner.last_budget_event = Some(event.clone());
            }
        }

        // Store todo list events for late subscribers (NEW)
        if matches!(&event,
            agent_core::AgentEvent::TodoListUpdated { .. } |
            agent_core::AgentEvent::TodoListDelta { .. }
        ) {
            let mut runners = state_for_forwarder.agent_runners.write().await;
            if let Some(runner) = runners.get_mut(&session_id_forwarder) {
                runner.last_todo_list_event = Some(event.clone());
                runner.todo_list_generation += 1;
            }
        }

        // Forward to broadcast
        if broadcast_tx.send(event.clone()).is_err() {
            log::debug!("[{}] No subscribers for event", session_id_forwarder);
        }
    }
});
```

#### 1.6 SSE Handler 优化

```rust
// crates/agent-server/src/handlers/events.rs

pub async fn handler(
    state: web::Data<AppState>,
    path: web::Path<String>,
    _req: HttpRequest,
) -> impl Responder {
    let session_id = path.into_inner();

    // Get runner and last events
    let (event_receiver, runner_status, budget_event_to_replay, todo_list_event_to_replay) = {
        let runners = state.agent_runners.read().await;
        match runners.get(&session_id) {
            Some(runner) => {
                let rx = runner.event_sender.subscribe();
                let status = runner.status.clone();
                let budget_event = runner.last_budget_event.clone();
                let todo_list_event = runner.last_todo_list_event.clone();  // NEW
                (Some(rx), Some(status), budget_event, todo_list_event)
            }
            None => (None, None, None, None),
        }
    };

    // ... existing logic for completed runner ...

    HttpResponse::Ok()
        .append_header((header::CONTENT_TYPE, "text/event-stream"))
        .append_header((header::CACHE_CONTROL, "no-cache"))
        .append_header((header::CONNECTION, "keep-alive"))
        .streaming(async_stream::stream! {
            // Replay last budget event if available
            if let Some(ref budget_event) = budget_event_to_replay {
                yield Ok::<_, actix_web::Error>(
                    actix_web::web::Bytes::from(format!("data: {}\n\n",
                        serde_json::to_string(budget_event).unwrap()))
                );
            }

            // Replay last todo list event if available (NEW)
            if let Some(ref todo_list_event) = todo_list_event_to_replay {
                yield Ok::<_, actix_web::Error>(
                    actix_web::web::Bytes::from(format!("data: {}\n\n",
                        serde_json::to_string(todo_list_event).unwrap()))
                );
            }

            // Continue with live events
            while let Ok(event) = receiver.recv().await {
                // ... existing logic ...
            }
        })
}
```

### 2. 前端设计

#### 2.1 Zustand Store Slice

```typescript
// src/pages/ChatPage/store/slices/todoListSlice.ts

import { StateCreator } from 'zustand';
import { TodoList, TodoItem, TodoListStatus } from '../../types/todoList';

export interface TodoListSlice {
  // State
  todoLists: Record<string, TodoList>;  // sessionId -> TodoList
  todoListVersions: Record<string, number>;  // sessionId -> version

  // Actions
  setTodoList: (sessionId: string, todoList: TodoList) => void;
  updateTodoListDelta: (sessionId: string, delta: TodoListDelta) => void;
  clearTodoList: (sessionId: string) => void;
  getTodoListVersion: (sessionId: string) => number;
}

export const createTodoListSlice: StateCreator<TodoListSlice> = (set, get) => ({
  // State
  todoLists: {},
  todoListVersions: {},

  // Set full todo list (from TodoListUpdated event)
  setTodoList: (sessionId, todoList) =>
    set((state) => ({
      todoLists: {
        ...state.todoLists,
        [sessionId]: todoList,
      },
      todoListVersions: {
        ...state.todoListVersions,
        [sessionId]: todoList.version || 0,
      },
    })),

  // Update from delta (from TodoListDelta event)
  updateTodoListDelta: (sessionId, delta) =>
    set((state) => {
      const currentVersion = state.todoListVersions[sessionId] || 0;

      // Ignore outdated updates
      if (delta.version <= currentVersion) {
        return state;
      }

      return {
        todoLists: {
          ...state.todoLists,
          [sessionId]: {
            ...state.todoLists[sessionId],
            items: delta.items,
            status: delta.status,
            progress: {
              completed: delta.items.filter(i => i.status === 'completed').length,
              total: delta.items.length,
              percentage: delta.progress_percentage,
            },
            version: delta.version,
            updated_at: delta.updated_at,
          },
        },
        todoListVersions: {
          ...state.todoListVersions,
          [sessionId]: delta.version,
        },
      };
    }),

  // Clear todo list for a session
  clearTodoList: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...remainingTodoLists } = state.todoLists;
      const { [sessionId]: __, ...remainingVersions } = state.todoListVersions;
      return {
        todoLists: remainingTodoLists,
        todoListVersions: remainingVersions,
      };
    }),

  // Get current version
  getTodoListVersion: (sessionId) => {
    return get().todoListVersions[sessionId] || 0;
  },
});
```

#### 2.2 统一 SSE 事件处理

```typescript
// src/hooks/useAgentEventSubscription.ts

export interface AgentEventHandlers {
  onToken?: (content: string) => void;
  onToolStart?: (toolCallId: string, toolName: string, args: any) => void;
  onToolComplete?: (toolCallId: string, result: ToolResult) => void;
  onToolError?: (toolCallId: string, error: string) => void;
  onNeedClarification?: (question: string, options?: string[]) => void;
  onComplete?: (usage: TokenUsage) => void;
  onError?: (message: string) => void;

  // Token Budget (existing)
  onTokenBudgetUpdated?: (usage: TokenBudgetUsage) => void;

  // Todo List (NEW)
  onTodoListUpdated?: (todoList: TodoList) => void;
  onTodoListDelta?: (delta: TodoListDelta) => void;
  onTodoListCompleted?: (sessionId: string, completedAt: string) => void;
}

// 在事件处理中添加
switch (data.type) {
  // ... existing cases ...

  case 'todo_list_updated':
    handlers.onTodoListUpdated?.(data.todo_list);
    break;

  case 'todo_list_delta':
    handlers.onTodoListDelta?.(data.delta);
    break;

  case 'todo_list_completed':
    handlers.onTodoListCompleted?.(data.session_id, data.completed_at);
    break;
}
```

#### 2.3 TodoList 组件重构

```typescript
// src/components/TodoList/TodoList.tsx

import React, { useEffect, useCallback } from 'react';
import { useAppStore } from '../../pages/ChatPage/store';
import { TodoListDisplay } from '../../pages/ChatPage/components/TodoListDisplay';

interface TodoListProps {
  sessionId: string;
  initialCollapsed?: boolean;
}

export const TodoList: React.FC<TodoListProps> = ({
  sessionId,
  initialCollapsed = true,
}) => {
  // Get from Zustand store (real-time)
  const todoList = useAppStore((state) => state.todoLists[sessionId]);
  const setTodoList = useAppStore((state) => state.setTodoList);
  const updateTodoListDelta = useAppStore((state) => state.updateTodoListDelta);
  const clearTodoList = useAppStore((state) => state.clearTodoList);

  // Subscribe to events via useAgentEventSubscription
  // This is handled by the parent component (ChatView)
  // The events update the Zustand store, which triggers re-render here

  // Initialize from session on mount
  useEffect(() => {
    // If no todo list in store, fetch from HTTP
    if (!todoList) {
      agentApiClient.get<TodoList>(`todo/${sessionId}`)
        .then((data) => {
          if (data.items?.length > 0) {
            setTodoList(sessionId, data);
          }
        })
        .catch((err) => {
          // Handle 404 - no todo list for this session
          if (err.message?.includes('404')) {
            // No todo list yet, that's OK
            return;
          }
          console.error('Failed to fetch todo list:', err);
        });
    }

    return () => {
      // Optional: clear when unmounting
      // clearTodoList(sessionId);
    };
  }, [sessionId, todoList, setTodoList, clearTodoList]);

  // No need to manage SSE connection here
  // It's managed globally by useAgentEventSubscription

  if (!todoList || todoList.items.length === 0) {
    return null;
  }

  return (
    <TodoListDisplay
      todoList={todoList}
      initialCollapsed={initialCollapsed}
    />
  );
};
```

#### 2.4 ChatView 集成

```typescript
// src/pages/ChatPage/components/ChatView/index.tsx

export const ChatView: React.FC = () => {
  const { currentChat } = useChatContext();
  const setTodoList = useAppStore((state) => state.setTodoList);
  const updateTodoListDelta = useAppStore((state) => state.updateTodoListDelta);

  // Use unified event subscription
  const { isConnected } = useAgentEventSubscription({
    sessionId: currentChat?.id,
    onToken: (content) => { /* ... */ },
    onToolStart: (toolCallId, toolName, args) => { /* ... */ },

    // Token Budget (existing)
    onTokenBudgetUpdated: (usage) => { /* ... */ },

    // Todo List (NEW)
    onTodoListUpdated: (todoList) => {
      if (currentChat?.id) {
        setTodoList(currentChat.id, todoList);
      }
    },
    onTodoListDelta: (delta) => {
      if (currentChat?.id) {
        updateTodoListDelta(currentChat.id, delta);
      }
    },
  });

  return (
    <div>
      {/* ... other components ... */}

      {/* TodoList - simplified, no own SSE connection */}
      {currentChat?.id && <TodoList sessionId={currentChat.id} />}
    </div>
  );
};
```

### 3. 减少日志的设计

#### 3.1 日志级别优化

```rust
// 当前问题：太多重试日志
// 解决方案：只在关键节点记录日志，使用 debug! 代替 info!

// 1. 创建 todo list - 关键事件，用 info!
if tool_call.function.name == "create_todo_list" {
    log::info!("[{}] Todo list created: {} items", session_id, items.len());
}

// 2. 更新 todo item - 高频事件，用 debug!
if tool_call.function.name == "update_todo_item" {
    log::debug!("[{}] Todo item {} updated to {:?}",
        session_id, item_id, status);
}

// 3. 事件发送 - 使用 trace!
let _ = event_tx.send(event).await;
// 只在失败时记录
if let Err(e) = event_tx.send(event).await {
    log::warn!("[{}] Failed to send todo list event: {}", session_id, e);
}

// 4. 重连日志 - 减少频率
// 只在第1次和每5次重试时记录
if reconnect_count == 1 || reconnect_count % 5 == 0 {
    log::info!("[{}] Reconnecting SSE, attempt {}", session_id, reconnect_count);
}
```

#### 3.2 前端日志优化

```typescript
// src/services/TodoListSSEManager.ts

class TodoListSSEManager {
  private logError(message: string, error?: unknown) {
    // 只在开发环境或关键错误时记录
    if (process.env.NODE_ENV === 'development' || this.isCriticalError(error)) {
      console.error(`[TodoListSSEManager] ${message}`, error);
    }
  }

  private logDebug(message: string) {
    // 只在开发环境记录
    if (process.env.NODE_ENV === 'development') {
      console.log(`[TodoListSSEManager] ${message}`);
    }
  }

  private isCriticalError(error: unknown): boolean {
    // 判断是否为关键错误
    if (error instanceof Error) {
      return !error.message.includes('timeout') &&
             !error.message.includes('network');
    }
    return true;
  }
}
```

### 4. 数据结构对比

#### 4.1 当前 TodoList

```typescript
// 当前：session.todo_list 存储在内存，不持久化
// 每次 HTTP fetch 获取完整列表
// 前端组件自己管理 SSE 连接
```

#### 4.2 新设计 TodoList

```typescript
// 新设计：存储在 session 中，持久化
// 支持两种 SSE 事件：
// 1. TodoListUpdated - 完整列表（创建/重大变更）
// 2. TodoListDelta - 增量更新（频繁更新）
// 前端通过统一 useAgentEventSubscription 订阅
```

| 特性 | 当前设计 | 新设计 |
|------|---------|--------|
| 存储位置 | Agent Runner 内存 | Session (持久化) |
| SSE 事件 | 只有 `todo_list_updated` | `todo_list_updated` + `todo_list_delta` |
| 前端订阅 | 组件级独立连接 | 统一 useAgentEventSubscription |
| 状态管理 | 组件本地 state | Zustand Store |
| 页面刷新恢复 | HTTP fetch | Store + Config 双保险 |
| 日志量 | 高（重试日志多） | 低（分级日志） |

## 实施计划

### Phase 1: 后端修改

1. **修改 Session 结构** - 添加 `todo_list` 和 `todo_list_updated_at`
2. **添加新 Event 类型** - `TodoListDelta` 和 `TodoListCompleted`
3. **修改 AgentRunner** - 添加 `last_todo_list_event`
4. **修改 Event 转发器** - 保存 Todo List 事件
5. **修改 SSE Handler** - 重放 Todo List 事件
6. **优化日志** - 使用分级日志

### Phase 2: 前端修改

1. **创建 todoListSlice.ts** - Zustand Store
2. **修改 useAgentEventSubscription** - 添加 Todo List 事件处理
3. **重构 TodoList.tsx** - 移除独立 SSE，使用 Store
4. **修改 ChatView** - 订阅 Todo List 事件
5. **优化日志** - 减少不必要的日志

### Phase 3: 测试和验证

1. **功能测试** - 创建/更新/完成 Todo List
2. **性能测试** - 高频更新场景
3. **恢复测试** - 页面刷新/断线重连
4. **日志验证** - 确认日志量减少

## 预期效果

1. **可靠性提升**: Session 持久化 + Event 重放
2. **性能提升**: Delta 更新 + 延迟保存
3. **代码简化**: 统一 SSE 订阅 + Store 管理
4. **日志减少**: 分级日志 + 频率控制
5. **用户体验**: 页面刷新后状态保留
