# Plan-Act Agent 架构 - 创建完成 ✅

**日期**: 2025-11-02  
**OpenSpec Change**: `add-plan-act-agent-architecture`  
**状态**: ✅ **规范已创建并验证通过**

---

## 📋 你要求的设计已全部实现

根据你的需求，我已经创建了完整的 OpenSpec 变更规范：

### ✅ 1. Plan Agent 输出格式和前端渲染

**你的需求**:
> Plan Agent 按照 JSON 方式回复，Context Manager 给前端一个易于判断的字段

**已实现**:
```typescript
// 新的消息类型系统
type MessageType = "text" | "plan" | "question" | "tool_call" | "tool_result"

// Plan 消息格式
{
  "type": "plan",
  "goal": "用户的目标",
  "steps": [
    {
      "step_number": 1,
      "action": "要做什么",
      "reason": "为什么",
      "tools_needed": ["需要的工具"],
      "estimated_time": "预计时间"
    }
  ],
  "estimated_total_time": "总时间",
  "risks": ["潜在风险"],
  "prerequisites": ["前置条件"]
}
```

**前端组件**:
- `PlanMessageCard` - 渲染漂亮的计划卡片
- 显示编号步骤、工具、风险
- "执行计划" 和 "优化计划" 按钮

---

### ✅ 2. Plan Agent 只读权限和手动切换

**你的需求**:
> Plan 不能修改文件，只能读取，做出计划后用户手动切换到 Act 模式

**已实现**:

#### Plan 模式限制:
```rust
pub enum AgentMode {
    Plan,  // 只读模式
    Act,   // 执行模式
}

pub struct ToolDefinition {
    pub read_only: bool,  // 新字段
    // ...
}
```

**工具分类**:
- **Plan 模式可用** (read_only=true):
  - `read_file`, `search_code`, `list_directory`
  - `grep`, `find_references`, `get_file_info`
  
- **Act 模式可用** (read_only=false):
  - `update_file`, `create_file`, `delete_file`
  - `rename_file`, `execute_command`

**手动切换**:
- 用户点击 "执行计划" 按钮
- API: `POST /v1/contexts/{id}/mode { "mode": "act" }`
- 模式持久化到聊天配置
- UI 清晰显示当前模式

---

### ✅ 3. Act Agent 自主性和问题机制

**你的需求**:
> Act Agent 有自主性，大改变要询问用户，使用 question JSON 格式

**已实现**:

#### 自主性规则（在 Prompt 中）:
```
小改变 → 直接执行（格式化、明显修复）
中等改变 → 提及但继续
大改变 → 通过 question 询问（删除文件、大重构）
```

#### Question 格式:
```json
{
  "type": "question",
  "question": "是否也要更新测试文件？",
  "context": "我注意到测试文件使用旧 API，这不在原计划中",
  "severity": "minor",  // critical, major, minor
  "options": [
    {
      "label": "是的，更新测试",
      "value": "update_tests",
      "description": "更新测试文件以匹配新 API"
    },
    {
      "label": "不，跳过测试",
      "value": "skip_tests",
      "description": "暂时保持测试文件不变"
    },
    {
      "label": "停止让我检查",
      "value": "pause",
      "description": "暂停执行以便我检查改动"
    }
  ],
  "default": "skip_tests"
}
```

#### 前端处理:
- Context Manager 解析 question JSON
- 发送给前端渲染
- `QuestionMessageCard` 显示交互式选项按钮
- 用户选择后发送答案
- Agent 继续执行

---

## 📁 创建的文件

### OpenSpec 变更目录:
```
openspec/changes/add-plan-act-agent-architecture/
├── proposal.md          ✅ 为什么、做什么、影响
├── design.md            ✅ 技术设计、决策、架构
├── tasks.md             ✅ 实现任务清单（10 大节，100+ 任务）
└── specs/
    ├── plan-act-agent-architecture/
    │   └── spec.md      ✅ 核心需求规范
    ├── agent-message-types/
    │   └── spec.md      ✅ 消息类型系统
    ├── tool-system/
    │   └── spec.md      ✅ 工具系统修改（read_only）
    └── context-manager/
        └── spec.md      ✅ Context Manager 修改
```

### 验证:
```bash
✅ openspec validate add-plan-act-agent-architecture --strict
   → Change 'add-plan-act-agent-architecture' is valid
```

---

## 🎯 核心设计要点

### 1. 两阶段执行
```
Plan 模式（规划）              Act 模式（执行）
      ↓                            ↓
读取文件分析         →     执行计划修改文件
输出结构化计划       →     自主调整 + 大改询问
用户审查讨论         →     执行直到完成
      ↓                            ↓
手动切换 "执行计划" 按钮
```

### 2. 消息类型系统
```typescript
Text        → 普通对话
Plan        → 结构化计划（特殊 UI）
Question    → 交互式问题（按钮选项）
ToolCall    → 工具调用（需要批准）
ToolResult  → 工具结果（可折叠）
```

### 3. 前端渲染策略
```typescript
switch (message.message_type) {
  case "plan":
    return <PlanMessageCard plan={message.content} />
  case "question":
    return <QuestionMessageCard question={message.content} />
  case "text":
  default:
    return <MessageCard message={message} />
}
```

---

## 🚀 下一步实现

### 推荐实现顺序:

#### Phase 1: 数据模型（1-2天）
1. 添加 `AgentMode` 枚举
2. 添加 `MessageType` 枚举
3. 更新 `ChatConfig` 和 `InternalMessage`
4. 添加 `read_only` 到工具定义

#### Phase 2: 后端服务（2-3天）
1. 实现模式感知的工具过滤
2. 实现 Plan/Question 解析器
3. 实现模式特定的 Prompt 注入
4. 添加模式切换 API

#### Phase 3: 前端组件（2-3天）
1. 创建 `AgentModeSelector`
2. 创建 `PlanMessageCard`
3. 创建 `QuestionMessageCard`
4. 更新消息路由逻辑

#### Phase 4: Prompt 工程（1-2天）
1. 编写 Plan 模式 Prompt
2. 编写 Act 模式 Prompt
3. 测试和优化

#### Phase 5: 测试和优化（2-3天）
1. 单元测试
2. 集成测试
3. 端到端测试
4. UX 优化

**总预计**: 8-13 天

---

## 💡 关键设计决策

### 决策 1: 手动模式切换
- ✅ 用户保持控制
- ✅ 防止意外执行
- ✅ 清晰的批准检查点

### 决策 2: 结构化消息类型
- ✅ 前端可以渲染专门的 UI
- ✅ 易于扩展新类型
- ✅ 向后兼容（默认 Text）

### 决策 3: 只读工具标志
- ✅ 简单的布尔标志
- ✅ 易于在 AgentService 中强制执行
- ✅ 清晰的安全边界

### 决策 4: 自主性指南
- ✅ 在 Prompt 中定义规则
- ✅ 严重程度级别（critical/major/minor）
- ✅ AI 可以判断何时询问

---

## 📖 文档亮点

### Proposal.md 包含:
- 为什么需要这个架构
- 具体改变内容
- 影响的代码和规范
- 迁移说明

### Design.md 包含:
- 详细的技术决策及理由
- 数据模型变更
- 架构图和流程图
- 风险和缓解策略
- 迁移计划

### Tasks.md 包含:
- 10 个主要部分
- 100+ 详细任务
- 每个任务都可检查完成
- 清晰的依赖关系

### Specs 包含:
- 完整的需求规范
- 每个需求都有多个场景
- ADDED/MODIFIED 清晰标记
- 可验证的验收标准

---

## ✅ 验证完成

```bash
$ openspec validate add-plan-act-agent-architecture --strict
✅ Change 'add-plan-act-agent-architecture' is valid
```

所有规范都符合 OpenSpec 格式要求：
- ✅ 每个需求都有场景
- ✅ 场景使用正确的格式
- ✅ Delta 操作标记正确
- ✅ 文件结构完整

---

## 🎉 总结

你的 Plan-Act Agent 架构设计已经完整地转化为 OpenSpec 变更规范！

**已完成**:
1. ✅ 详细的提案文档
2. ✅ 完整的技术设计
3. ✅ 100+ 任务的实现清单
4. ✅ 4 个能力的规范文档
5. ✅ OpenSpec 验证通过

**特点**:
- 📋 结构化计划输出（JSON 格式）
- 🔒 Plan 模式只读权限
- 🔄 手动模式切换
- ❓ 问题式批准机制
- 🎨 前端渲染不同 UI
- 🤖 Act Agent 自主性

**现在可以**:
1. 按照 tasks.md 开始实现
2. 或者先实现 MVP（核心功能）
3. 或者讨论和优化设计

你想现在开始实现吗？还是有什么需要调整的设计？🚀


