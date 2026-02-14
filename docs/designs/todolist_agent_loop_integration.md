# TodoList 集成到 Agent Loop 的架构设计

## 当前架构分析

### 1. 现有的 TodoList 集成点

当前 TodoList 已经有部分集成到 Agent Loop：

```rust
// crates/agent-loop/src/runner.rs:148-149
for round in 0..config.max_rounds {
    // 每轮开始时注入 todo list 到 system message
    inject_todo_list_into_system_message(session);
    // ... agent loop logic
}
```

**注入函数实现**（runner.rs:847-877）:
```rust
fn inject_todo_list_into_system_message(session: &mut Session) {
    let todo_context = session.format_todo_list_for_prompt();

    if let Some(system_message) = session
        .messages
        .iter_mut()
        .find(|message| matches!(message.role, agent_core::Role::System))
    {
        let base_prompt = strip_existing_todo_list(&system_message.content);

        system_message.content = if todo_context.is_empty() {
            base_prompt
        } else {
            format!("{}\n\n{}", base_prompt, todo_context)
        };
    }
}
```

**工具调用处理**（runner.rs:410-522）:
```rust
// 在工具调用成功后
if tool_call.function.name == "create_todo_list" && result.success {
    // 解析参数，创建 TodoList
    let todo_list = agent_core::TodoList { ... };
    session.set_todo_list(todo_list.clone());

    // 发送事件
    event_tx.send(AgentEvent::TodoListUpdated { todo_list }).await;
}

if tool_call.function.name == "update_todo_item" && result.success {
    // 更新 TodoList
    session.todo_list.update_item(...);

    // 发送事件
    event_tx.send(AgentEvent::TodoListUpdated { todo_list }).await;
}
```

### 2. 当前架构的问题

| 问题 | 描述 | 影响 |
|------|------|------|
| **依赖工具调用** | TodoList 通过工具（create_todo_list/update_todo_item）管理 | Agent 必须显式调用工具 |
| **手动注入** | 每轮手动注入到 system message | 可能遗忘或时机不对 |
| **无循环集成** | 不是循环的核心部分，而是附加功能 | 无法自动跟踪任务进度 |
| **状态分散** | 状态在 Session、工具调用、事件之间分散 | 难以维护 |

---

## 新架构设计：将 TodoList 作为 Agent Loop 的一等公民

### 核心理念

将 TodoList 从"可选工具"升级为"核心循环组件"，类似 Token Budget：

```
Agent Loop Iteration:
1. 准备上下文 (Token Budget)
2. 注入 TodoList (NEW: 一等公民)
3. 调用 LLM
4. 处理工具调用
5. 更新 TodoList (NEW: 自动跟踪)
6. 发送事件
7. 循环或结束
```

---

## 详细设计

### 1. Agent Loop 结构改造

```rust
// crates/agent-loop/src/runner.rs

pub async fn run_agent_loop_with_config(
    session: &mut Session,
    initial_message: String,
    event_tx: mpsc::Sender<AgentEvent>,
    llm: Arc<dyn LLMProvider>,
    tools: Arc<dyn ToolExecutor>,
    cancel_token: CancellationToken,
    config: AgentLoopConfig,
) -> Result<()> {
    // ... initialization ...

    // 新增：初始化 TodoList 上下文（如果有）
    let todo_context = TodoLoopContext::from_session(session);

    for round in 0..config.max_rounds {
        // ========== 1. Token Budget 准备 ==========
        let budget = resolve_token_budget(&session, &config, &model_name);
        let prepared_context = prepare_hybrid_context(&session, &budget, &counter)?;

        // ========== 2. TodoList 注入（一等公民）==========
        // 类似 Token Budget，注入到上下文中
        let prepared_context_with_todo = inject_todo_list_context(
            prepared_context,
            &todo_context,
            round,
            config.max_rounds,
        );

        // ========== 3. LLM 调用 ==========
        let stream = llm.chat_stream(
            &prepared_context_with_todo.messages,
            &tool_schemas,
            Some(budget.max_output_tokens),
        ).await?;

        // ========== 4. 消费 LLM 流 ==========
        let stream_output = consume_llm_stream(stream, &event_tx, &cancel_token, &session_id).await?;

        // ========== 5. 处理工具调用 ==========
        for tool_call in &stream_output.tool_calls {
            let result = execute_tool_call(tool_call, tools.as_ref(), ...).await;

            // ========== 6. 自动更新 TodoList（NEW）==========
            // 无论是否调用 create_todo_list/update_todo_item 工具
            // Agent Loop 自动根据工具调用更新 TodoList
            if let Some(ref mut todo_ctx) = todo_context {
                todo_ctx.track_tool_execution(
                    tool_call.function.name.as_str(),
                    &result,
                    round,
                );
            }

            // 处理工具结果
            let outcome = handle_tool_result_with_agentic_support(...).await;
            // ... existing logic ...
        }

        // ========== 7. 循环结束检查 ==========
        // 检查 TodoList 是否完成
        if todo_context.is_all_completed() {
            log::info!("[{}] All todo items completed", session_id);

            // 发送 TodoListCompleted 事件
            event_tx.send(AgentEvent::TodoListCompleted {
                session_id: session_id.clone(),
                completed_at: Utc::now(),
            }).await.ok();

            // 可选：自动结束循环
            break;
        }
    }

    // ========== 8. 最终同步 ==========
    // 将 TodoList 上下文同步回 Session
    if let Some(todo_ctx) = todo_context {
        session.todo_list = todo_ctx.into_todo_list();
        session.todo_list_updated_at = Some(Utc::now());

        // 持久化
        if let Some(storage) = &storage {
            storage.save_session(session).await?;
        }
    }

    // ... rest of the function ...
}
```

### 2. TodoLoopContext 结构

```rust
// crates/agent-loop/src/todo_context.rs (NEW FILE)

use agent_core::{TodoList, TodoItem, TodoItemStatus};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// TodoList 在 Agent Loop 中的上下文
/// 作为一等公民，跟踪整个循环过程
#[derive(Debug, Clone)]
pub struct TodoLoopContext {
    /// Session ID
    pub session_id: String,

    /// Todo 列表
    pub items: Vec<TodoLoopItem>,

    /// 当前活跃的 todo item ID
    pub active_item_id: Option<String>,

    /// 当前轮次
    pub current_round: u32,

    /// 总轮次
    pub max_rounds: u32,

    /// 创建时间
    pub created_at: DateTime<Utc>,

    /// 最后更新时间
    pub updated_at: DateTime<Utc>,

    /// 版本号（用于前端去重）
    pub version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoLoopItem {
    pub id: String,
    pub description: String,
    pub status: TodoItemStatus,

    /// 工具调用历史（跟踪执行过程）
    pub tool_calls: Vec<ToolCallRecord>,

    /// 开始轮次
    pub started_at_round: Option<u32>,

    /// 完成轮次
    pub completed_at_round: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRecord {
    pub round: u32,
    pub tool_name: String,
    pub success: bool,
    pub timestamp: DateTime<Utc>,
}

impl TodoLoopContext {
    /// 从 Session 创建 TodoLoopContext
    pub fn from_session(session: &Session) -> Option<Self> {
        session.todo_list.as_ref().map(|todo_list| Self {
            session_id: todo_list.session_id.clone(),
            items: todo_list.items.iter().map(|item| TodoLoopItem {
                id: item.id.clone(),
                description: item.description.clone(),
                status: item.status.clone(),
                tool_calls: Vec::new(),
                started_at_round: None,
                completed_at_round: None,
            }).collect(),
            active_item_id: None,
            current_round: 0,
            max_rounds: 50,
            created_at: todo_list.created_at,
            updated_at: todo_list.updated_at,
            version: 0,
        })
    }

    /// 跟踪工具执行
    pub fn track_tool_execution(
        &mut self,
        tool_name: &str,
        result: &ToolResult,
        round: u32,
    ) {
        self.current_round = round;

        // 记录工具调用
        let record = ToolCallRecord {
            round,
            tool_name: tool_name.to_string(),
            success: result.success,
            timestamp: Utc::now(),
        };

        // 自动将工具调用关联到当前活跃的 todo item
        if let Some(ref active_id) = self.active_item_id {
            if let Some(item) = self.items.iter_mut().find(|i| &i.id == active_id) {
                item.tool_calls.push(record);
                self.updated_at = Utc::now();
                self.version += 1;
            }
        }
    }

    /// 设置活跃的 todo item
    pub fn set_active_item(&mut self, item_id: &str) {
        // 完成之前的活跃 item
        if let Some(ref prev_id) = self.active_item_id {
            if let Some(item) = self.items.iter_mut().find(|i| &i.id == prev_id) {
                item.status = TodoItemStatus::Completed;
                item.completed_at_round = Some(self.current_round);
            }
        }

        // 设置新的活跃 item
        self.active_item_id = Some(item_id.to_string());
        if let Some(item) = self.items.iter_mut().find(|i| &i.id == item_id) {
            item.status = TodoItemStatus::InProgress;
            item.started_at_round = Some(self.current_round);
        }

        self.updated_at = Utc::now();
        self.version += 1;
    }

    /// 检查是否所有 todo item 都完成
    pub fn is_all_completed(&self) -> bool {
        !self.items.is_empty() && self.items.iter().all(|item| {
            matches!(item.status, TodoItemStatus::Completed)
        })
    }

    /// 生成用于 prompt 的上下文
    pub fn format_for_prompt(&self) -> String {
        if self.items.is_empty() {
            return String::new();
        }

        let mut output = format!(
            "\n\n## Current Task List (Round {}/{})\n",
            self.current_round + 1,
            self.max_rounds
        );

        for item in &self.items {
            let status_icon = match item.status {
                TodoItemStatus::Pending => "[ ]",
                TodoItemStatus::InProgress => "[/]",
                TodoItemStatus::Completed => "[x]",
                TodoItemStatus::Blocked => "[!]",
            };

            output.push_str(&format!(
                "\n{} {}: {}",
                status_icon, item.id, item.description
            ));

            if !item.tool_calls.is_empty() {
                output.push_str(&format!(
                    " ({} tool calls)",
                    item.tool_calls.len()
                ));
            }
        }

        let completed = self.items.iter().filter(|i| {
            matches!(i.status, TodoItemStatus::Completed)
        }).count();
        output.push_str(&format!(
            "\n\nProgress: {}/{} tasks completed",
            completed,
            self.items.len()
        ));

        output
    }

    /// 转换为 TodoList（用于持久化）
    pub fn into_todo_list(self) -> TodoList {
        TodoList {
            session_id: self.session_id,
            title: "Agent Tasks".to_string(),
            items: self.items.into_iter().map(|loop_item| {
                agent_core::TodoItem {
                    id: loop_item.id,
                    description: loop_item.description,
                    status: loop_item.status,
                    depends_on: Vec::new(),
                    notes: String::new(),
                }
            }).collect(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}
```

### 3. 事件类型扩展

```rust
// crates/agent-core/src/agent/events.rs

pub enum AgentEvent {
    // ... existing events ...

    /// Todo list created or updated (full state)
    TodoListUpdated {
        todo_list: TodoList,
    },

    /// Todo list item progress (delta update - NEW)
    TodoListItemProgress {
        session_id: String,
        item_id: String,
        status: TodoItemStatus,
        tool_calls_count: usize,
        version: u64,
    },

    /// Todo list fully completed (NEW)
    TodoListCompleted {
        session_id: String,
        completed_at: DateTime<Utc>,
        total_rounds: u32,
        total_tool_calls: usize,
    },

    /// Todo list context injected (for transparency - NEW)
    TodoListContextInjected {
        session_id: String,
        total_items: usize,
        active_item: Option<String>,
        round: u32,
    },
}
```

### 4. 自动工具跟踪策略

```rust
// crates/agent-loop/src/todo_context.rs

impl TodoLoopContext {
    /// 智能匹配工具到 todo item
    pub fn auto_match_tool_to_item(&mut self, tool_name: &str, round: u32) {
        // 策略 1: 关键字匹配
        let matching_item = self.items.iter().find(|item| {
            item.description.to_lowercase().contains(&tool_name.to_lowercase())
        });

        // 策略 2: 工具类型推断
        // read_file, write_file → 代码修改任务
        // execute_command → 构建或运行任务
        // search_* → 调研任务

        if let Some(item) = matching_item {
            self.set_active_item(&item.id);
        }
    }

    /// 根据工具执行结果自动更新状态
    pub fn auto_update_status(&mut self, tool_name: &str, result: &ToolResult) {
        // 如果没有活跃 item，尝试自动匹配
        if self.active_item_id.is_none() {
            self.auto_match_tool_to_item(tool_name, self.current_round);
        }

        // 根据工具执行结果推断 todo item 状态
        if result.success {
            // 成功的连续工具调用可能表示任务完成
            if let Some(ref active_id) = self.active_item_id {
                if let Some(item) = self.items.iter_mut().find(|i| &i.id == active_id) {
                    // 检查是否应该标记为完成
                    if self.should_mark_completed(item, tool_name) {
                        item.status = TodoItemStatus::Completed;
                        item.completed_at_round = Some(self.current_round);
                        self.active_item_id = None; // 清空活跃 item
                        self.version += 1;
                    }
                }
            }
        } else {
            // 失败可能需要标记为 blocked
            if let Some(ref active_id) = self.active_item_id {
                if let Some(item) = self.items.iter_mut().find(|i| &i.id == active_id) {
                    if self.should_mark_blocked(item, tool_name, result) {
                        item.status = TodoItemStatus::Blocked;
                        self.version += 1;
                    }
                }
            }
        }
    }

    fn should_mark_completed(&self, item: &TodoLoopItem, tool_name: &str) -> bool {
        // 简单策略：3次成功工具调用后自动完成
        let success_count = item.tool_calls.iter().filter(|r| r.success).count();
        success_count >= 3
    }

    fn should_mark_blocked(&self, item: &TodoLoopItem, tool_name: &str, result: &ToolResult) -> bool {
        // 简单策略：连续 2 次失败标记为 blocked
        let recent_failures = item.tool_calls.iter()
            .rev()
            .take(2)
            .filter(|r| !r.success)
            .count();
        recent_failures >= 2
    }
}
```

---

## 与现有工具的兼容性

### 1. 保留现有工具

```rust
// create_todo_list 和 update_todo_item 工具仍然存在
// 但它们现在修改 TodoLoopContext，而不是直接修改 Session

if tool_call.function.name == "create_todo_list" {
    // 从工具参数创建 TodoLoopContext
    let items: Vec<TodoItem> = parse_args(&tool_call)?;
    let todo_context = TodoLoopContext::new(session_id, items);

    // 存储到 session（供后续轮次使用）
    session.todo_list = Some(todo_context.clone().into_todo_list());

    // 发送事件
    event_tx.send(AgentEvent::TodoListUpdated {
        todo_list: session.todo_list.clone().unwrap(),
    }).await.ok();
}

if tool_call.function.name == "update_todo_item" {
    // 修改 TodoLoopContext
    if let Some(ref mut todo_ctx) = todo_context {
        todo_ctx.set_active_item(&item_id);
        // 或者手动更新状态
        todo_ctx.update_item_status(&item_id, status);
    }
}
```

### 2. 自动 vs 手动

| 操作 | 手动（工具调用） | 自动（Loop 跟踪） |
|------|----------------|------------------|
| 创建 TodoList | ✅ create_todo_list | ✅ 从 Session 恢复 |
| 更新状态 | ✅ update_todo_item | ✅ 根据工具执行自动更新 |
| 跟踪进度 | ❌ 无 | ✅ 自动记录工具调用 |
| 完成检查 | ❌ 无 | ✅ 自动检查并完成 |
| 注入 Prompt | ❌ 手动 | ✅ 每轮自动注入 |

**推荐模式**:
- **首次**: Agent 调用 `create_todo_list` 创建任务列表
- **后续**: Agent Loop 自动跟踪进度，无需再调用工具
- **手动干预**: Agent 可以调用 `update_todo_item` 强制更新状态

---

## 实施计划

### Phase 1: 创建 TodoLoopContext（1-2天）

1. 创建 `crates/agent-loop/src/todo_context.rs`
2. 实现 `TodoLoopContext` 结构和方法
3. 添加单元测试

### Phase 2: 集成到 Agent Loop（2-3天）

1. 修改 `run_agent_loop_with_config` 添加 TodoLoopContext
2. 实现自动工具跟踪
3. 实现 prompt 注入
4. 发送新事件类型

### Phase 3: 前端支持（2-3天）

1. 修改 Zustand Store 支持新事件类型
2. 更新 UI 显示进度和工具调用历史
3. 测试页面刷新恢复

### Phase 4: 测试和优化（1-2天）

1. 集成测试
2. 性能测试（高频工具调用）
3. 日志优化

---

## 预期效果

### 改进对比

| 特性 | 当前设计 | 新设计 |
|------|---------|--------|
| **集成方式** | 工具调用（可选） | Loop 一等公民（必须） |
| **状态跟踪** | 手动 | 自动 |
| **进度显示** | 简单列表 | 包含工具调用历史 |
| **完成检测** | 无 | 自动检测并结束 |
| **日志量** | 高 | 低（只在关键节点） |
| **可靠性** | 中 | 高（Loop 级保证） |

### 用户体验提升

1. **更准确**: 自动跟踪工具调用，不会遗漏
2. **更实时**: 每轮自动更新，无需等待工具调用
3. **更透明**: 显示工具调用历史，理解 Agent 行为
4. **更可靠**: Loop 级保证，即使工具调用失败也能恢复

---

## 关键优势

1. **一等公民**: 与 Token Budget 同等地位，核心循环组件
2. **自动跟踪**: 无需 Agent 显式调用工具
3. **智能推断**: 根据工具执行自动推断任务状态
4. **历史记录**: 保存完整的执行历史，便于调试
5. **向后兼容**: 保留现有工具，渐进式升级
