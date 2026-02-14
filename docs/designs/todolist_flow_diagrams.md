# TodoList 更新流程图

## 1. 完整的 Agent Loop 执行流程

```mermaid
graph TD
    Start[用户发送消息] --> Init[初始化 Session]
    Init --> InitCtx{Session 有<br/>TodoList?}
    InitCtx -->|Yes| CreateCtx[创建 TodoLoopContext<br/>from_session]
    InitCtx -->|No| NoCtx[不创建 TodoLoopContext]

    CreateCtx --> LoopStart[Agent Loop 开始]
    NoCtx --> LoopStart

    LoopStart --> RoundStart[Round N 开始]
    RoundStart --> Inject[注入 TodoList 到<br/>System Prompt]
    Inject --> CallLLM[调用 LLM]

    CallLLM --> ParseTools{有 Tool Calls?}

    ParseTools -->|No| AssistantMsg[返回 Assistant Message]
    AssistantMsg --> SendComplete[发送 Complete Event]
    SendComplete --> End[结束]

    ParseTools -->|Yes| ToolLoop[For Each Tool Call]

    ToolLoop --> ExecuteTool[执行工具]
    ExecuteTool --> ToolResult{工具执行结果}

    ToolResult --> TrackAuto{TodoLoopContext<br/>存在?}

    %% 自动更新路径
    TrackAuto -->|Yes| AutoUpdate[1. auto_update_status<br/>2. track_tool_execution]
    AutoUpdate --> CheckComplete{任务完成?}
    CheckComplete -->|Yes| SendProgress[发送 TodoListItemProgress<br/>status=completed]
    CheckComplete -->|No| SendProgress2[发送 TodoListItemProgress<br/>status=in_progress]

    %% 手动工具路径
    ToolResult -->|create_todo_list| CreateTodo[创建 TodoList]
    CreateTodo --> ReinitCtx[重新初始化<br/>TodoLoopContext]
    ReinitCtx --> EmitUpdate[发送 TodoListUpdated Event]

    ToolResult -->|update_todo_item| ManualUpdate[手动更新状态]
    ManualUpdate --> SyncCtx[同步到 TodoLoopContext]
    SyncCtx --> EmitUpdate2[发送 TodoListUpdated Event]

    SendProgress --> NextTool{还有工具?}
    SendProgress2 --> NextTool
    EmitUpdate --> NextTool
    EmitUpdate2 --> NextTool

    NextTool -->|Yes| ToolLoop
    NextTool -->|No| CheckAllComplete{所有任务完成?}

    CheckAllComplete -->|Yes| SendCompleted[发送 TodoListCompleted Event]
    CheckAllComplete -->|No| NextRound{达到 max_rounds?}

    SendCompleted --> SyncSession[同步 TodoLoopContext<br/>到 Session]
    SyncSession --> NextRound

    NextRound -->|No| RoundStart
    NextRound -->|Yes| End
```

## 2. 自动状态推断流程（详细）

```mermaid
graph TD
    Start[Tool 执行完成] --> HasCtx{TodoLoopContext<br/>存在?}

    HasCtx -->|No| NoAuto[无自动更新]
    HasCtx -->|Yes| AutoStatus[auto_update_status]

    AutoStatus --> HasActive{有 active_item?}

    HasActive -->|No| TryMatch[尝试自动匹配<br/>工具 → TodoItem]
    HasActive -->|Yes| UseActive[使用当前 active_item]

    TryMatch --> MatchFound{匹配成功?}
    MatchFound -->|Yes| SetActive[设置为 active_item]
    MatchFound -->|No| NoUpdate[不更新状态]

    SetActive --> CheckResult{执行成功?}
    UseActive --> CheckResult

    CheckResult -->|Success| IncSuccess[记录成功工具调用]
    CheckResult -->|Failure| IncFailure[记录失败工具调用]

    IncSuccess --> CountSuccess[统计成功次数]
    CountSuccess --> Ge3{成功次数 >= 3?}

    Ge3 -->|Yes| MarkComplete[标记为 Completed]
    Ge3 -->|No| KeepInProgress[保持 InProgress]

    IncFailure --> CountFailure[统计最近失败次数]
    CountFailure --> Ge2{最近失败 >= 2?}

    Ge2 -->|Yes| MarkBlocked[标记为 Blocked]
    Ge2 -->|No| KeepInProgress2[保持 InProgress]

    MarkComplete --> SendEvent[发送 TodoListItemProgress]
    KeepInProgress --> SendEvent
    MarkBlocked --> SendEvent
    KeepInProgress2 --> SendEvent2[发送 TodoListItemProgress]

    SendEvent --> End[结束]
    SendEvent2 --> End
    NoAuto --> End
    NoUpdate --> End
```

## 3. 手动 vs 自动更新对比

```mermaid
graph LR
    subgraph 自动更新路径
        A1[Tool 执行] --> A2[auto_update_status]
        A2 --> A3[检查规则]
        A3 --> A4[3次成功 → 完成]
        A3 --> A5[2次失败 → 阻塞]
        A4 --> A6[发送 Progress Event]
        A5 --> A6
    end

    subgraph 手动更新路径
        M1[Agent 决定] --> M2[调用 update_todo_item]
        M2 --> M3[手动设置状态]
        M3 --> M4[添加 notes]
        M4 --> M5[同步到 TodoLoopContext]
        M5 --> M6[发送 Updated Event]
    end

    A6 --> Result[前端更新 UI]
    M6 --> Result
```

## 4. 数据流：从前端到后端

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端 (React)
    participant S as Zustand Store
    participant SSE as SSE Connection
    participant B as Backend (Rust)
    participant C as TodoLoopContext
    participant L as LLM

    U->>F: 发送消息
    F->>B: POST /execute
    B->>B: 初始化 TodoLoopContext

    loop Agent Loop
        B->>L: 调用 LLM
        L->>B: 返回 tool_calls

        loop For Each Tool
            B->>B: 执行工具

            alt 自动更新
                B->>C: auto_update_status
                C->>C: 检查启发式规则
                C->>B: 更新状态
            else 手动更新
                B->>B: update_todo_item 工具
                B->>C: sync to TodoLoopContext
            end

            B->>SSE: 发送 TodoListItemProgress
            SSE->>F: SSE Event
            F->>S: updateTodoListDelta()
            S->>F: UI 更新
        end
    end

    B->>B: 同步 TodoLoopContext → Session
    B->>SSE: 发送 TodoListCompleted
    SSE->>F: SSE Event
    F->>F: 显示完成通知
```

## 5. 版本控制和冲突检测

```mermaid
graph TD
    Start[收到 TodoListItemProgress] --> GetDelta[提取 delta]
    GetDelta --> GetVersion[delta.version = ?]

    GetVersion --> GetCurrent[从 store 获取<br/>currentVersion]
    GetCurrent --> Compare{delta.version ><br/>currentVersion?}

    Compare -->|<= | Ignore[忽略：旧版本]
    Compare -->|>| Apply[应用更新]

    Apply --> UpdateItem[更新 item.status<br/>item.tool_calls_count]
    UpdateItem --> UpdateVersion[更新 store<br/>todoListVersionssessionId = delta.version]
    UpdateVersion --> TriggerUI[触发 UI 重渲染]

    Ignore --> Log[log: 忽略旧版本]
    Log --> End[结束]
    TriggerUI --> End
```

## 6. 关键问题：Session ID 匹配

```mermaid
graph TD
    subgraph 修复前 - BROKEN
        B1[Backend 发送 Event] --> B2[useAgentEventSubscription]
        B2 --> B3[setTodoList<br/>key = chatId]
        B3 --> B4[Store:<br/>todoListschatId = ...]
        B4 --> B5[TodoList.tsx<br/>读取 todoListssessionId]
        B5 --> B6[❌ 找不到数据！<br/>UI 不更新]
    end

    subgraph 修复后 - WORKING
        A1[Backend 发送 Event] --> A2[useAgentEventSubscription]
        A2 --> A3[setTodoList<br/>key = todoList.session_id]
        A3 --> A4[Store:<br/>todoListssession_id = ...]
        A4 --> A5[TodoList.tsx<br/>读取 todoListssessionId]
        A5 --> A6[✅ 找到数据！<br/>UI 正确更新]
    end
```

## 7. 改进建议：LLM 辅助决策（未来）

```mermaid
graph TD
    Start[Tool 执行成功] --> Count[统计成功次数]

    Count --> CheckCount{成功次数 >= 3?}

    CheckCount -->|No| Auto[自动：保持 InProgress]
    CheckCount -->|Yes| CheckTaskType{任务类型?}

    CheckTaskType -->|简单任务| AutoComplete[自动标记 Completed<br/>无需 LLM]
    CheckTaskType -->|复杂任务| AskLLM[询问 LLM<br/>"任务是否完成?"]

    AskLLM --> LLMResponse{LLM 回答}
    LLMResponse -->|Yes| ManualComplete[标记 Completed]
    LLMResponse -->|No| KeepGoing[继续执行]

    AutoComplete --> SendEvent[发送 Progress Event]
    ManualComplete --> SendEvent
    KeepGoing --> Auto
    Auto --> SendEvent2[发送 Progress Event]

    SendEvent --> End[结束]
    SendEvent2 --> End
```

## 关键说明

### 当前机制（自动 + 手动混合）

1. **自动更新**（默认）：
   - 触发：每次 tool 执行后
   - 规则：3 次成功 → 完成，2 次失败 → 阻塞
   - 优点：快速、自动、无需 LLM
   - 缺点：可能误判

2. **手动更新**（Agent 决定）：
   - 触发：Agent 调用 `update_todo_item` 工具
   - 场景：Agent 认为自动规则不准确
   - 优点：精确控制
   - 缺点：需要 Agent 主动干预

### 关键修复

- ✅ Session ID 匹配（前端能收到更新）
- ✅ TodoLoopContext 重新初始化（新列表有跟踪）
- ✅ 双向同步（手动 ↔ 自动不冲突）
- ✅ 完成事件发送（用户能看到完成）
- ✅ 版本控制（增量更新有效）

### 建议改进

1. **短期**：改进启发式规则（更智能的阈值）
2. **中期**：LLM 辅助决策（复杂任务询问 LLM）
3. **长期**：混合模式（简单自动，复杂 LLM）
