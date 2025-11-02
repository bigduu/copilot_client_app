# Agent 角色系统设计 - 更新版 🎭

**日期**: 2025-11-02  
**OpenSpec Change**: `add-plan-act-agent-architecture`  
**架构**: **角色系统 (Role System)** 而非简单的模式切换

---

## 🎯 核心设计理念

### 从 "模式" 到 "角色"

**之前的思路**: Mode（模式）
```
Plan Mode ↔ Act Mode
```

**新的架构**: Role（角色）+ Permissions（权限）
```
AgentRole::Planner + Permissions::ReadFiles
AgentRole::Actor + Permissions::[Read, Write, Delete, Execute]
未来: Commander, Designer, Reviewer, Tester...
```

---

## 🏗️ 架构核心组件

### 1. AgentRole 枚举（可扩展）

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentRole {
    Planner,  // 规划者 - 只读分析
    Actor,    // 执行者 - 完整权限
    
    // 未来可扩展：
    // Commander,  // 指挥家 - 协调其他角色
    // Designer,   // 设计者 - 创建但不修改
    // Reviewer,   // 审查者 - 只读反馈
    // Tester,     // 测试者 - 只读+执行测试
}
```

### 2. Permission 权限系统

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Permission {
    ReadFiles,          // 读取文件
    WriteFiles,         // 写入文件
    CreateFiles,        // 创建文件
    DeleteFiles,        // 删除文件
    ExecuteCommands,    // 执行命令
}

impl AgentRole {
    pub fn permissions(&self) -> Vec<Permission> {
        match self {
            AgentRole::Planner => vec![
                Permission::ReadFiles,
            ],
            AgentRole::Actor => vec![
                Permission::ReadFiles,
                Permission::WriteFiles,
                Permission::CreateFiles,
                Permission::DeleteFiles,
                Permission::ExecuteCommands,
            ],
        }
    }
}
```

### 3. 工具权限要求

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub required_permissions: Vec<Permission>,  // 新字段
    // ...
}

// 示例：
ToolDefinition {
    name: "read_file",
    required_permissions: vec![Permission::ReadFiles],
}

ToolDefinition {
    name: "update_file",
    required_permissions: vec![
        Permission::ReadFiles,   // 需要读取现有内容
        Permission::WriteFiles,  // 需要写入修改
    ],
}

ToolDefinition {
    name: "delete_file",
    required_permissions: vec![
        Permission::ReadFiles,   // 需要确认文件存在
        Permission::DeleteFiles, // 需要删除权限
    ],
}
```

---

## 🎭 当前实现的两个角色

### 角色 1: Planner（规划者）

**职责**:
- 📖 读取和分析代码
- 🔍 搜索和探索
- 📋 制定执行计划
- 💬 与用户讨论方案

**权限**:
```rust
vec![Permission::ReadFiles]
```

**可用工具**:
- ✅ `read_file` - 读取文件
- ✅ `search_code` - 搜索代码
- ✅ `list_directory` - 列出目录
- ✅ `grep` - 文本搜索
- ✅ `find_references` - 查找引用

**不可用工具**:
- ❌ `update_file` - 需要 WriteFiles
- ❌ `create_file` - 需要 CreateFiles
- ❌ `delete_file` - 需要 DeleteFiles
- ❌ `execute_command` - 需要 ExecuteCommands

**系统 Prompt 特点**:
```
# CURRENT ROLE: PLANNER

YOUR PERMISSIONS:
- ✅ Read files, search code, list directories
- ❌ Write, create, or delete files
- ❌ Execute commands

YOUR GOAL:
Create a detailed plan for the user to review and approve.
```

### 角色 2: Actor（执行者）

**职责**:
- ⚡ 执行已批准的计划
- 🔧 修改和创建文件
- 🤖 自主做小调整
- ❓ 大改动时询问用户

**权限**:
```rust
vec![
    Permission::ReadFiles,
    Permission::WriteFiles,
    Permission::CreateFiles,
    Permission::DeleteFiles,
    Permission::ExecuteCommands,
]
```

**可用工具**: 所有工具（根据权限过滤）

**系统 Prompt 特点**:
```
# CURRENT ROLE: ACTOR

YOUR PERMISSIONS:
- ✅ Read, write, create, delete files
- ✅ Execute commands
- ✅ Full tool access

AUTONOMY GUIDELINES:
- Small changes: Proceed
- Large changes: Ask via question format
```

---

## 🚀 未来可扩展的角色示例

### Commander（指挥家）

**概念**: 高层协调，不直接操作文件

```rust
AgentRole::Commander => vec![
    Permission::ReadFiles,
    // 特殊权限（未来实现）:
    // Permission::DelegateToRole,
    // Permission::CoordinateWorkflow,
]
```

**用途**:
- 制定多步骤策略
- 协调 Planner 和 Actor
- 不直接修改文件

### Designer（设计者）

**概念**: 创建新内容，不修改现有

```rust
AgentRole::Designer => vec![
    Permission::ReadFiles,
    Permission::CreateFiles,
    // 注意：没有 WriteFiles 和 DeleteFiles
]
```

**用途**:
- 创建新组件
- 生成样板代码
- 不能修改现有文件

### Reviewer（审查者）

**概念**: 代码审查，纯只读

```rust
AgentRole::Reviewer => vec![
    Permission::ReadFiles,
    // 只读，用于审查
]
```

**用途**:
- 代码审查
- 输出结构化反馈
- 发现问题和改进点

### Tester（测试者）

**概念**: 运行测试，不修改源码

```rust
AgentRole::Tester => vec![
    Permission::ReadFiles,
    Permission::ExecuteCommands, // 用于运行测试
    // 注意：没有写入权限
]
```

**用途**:
- 运行测试套件
- 执行检查命令
- 报告测试结果

---

## 🔐 权限过滤机制

### 工具过滤流程

```rust
fn filter_tools_for_role(
    all_tools: &[ToolDefinition],
    role: &AgentRole,
) -> Vec<ToolDefinition> {
    let role_permissions = role.permissions();
    
    all_tools
        .iter()
        .filter(|tool| {
            // 工具的所有要求权限都必须被角色拥有
            tool.required_permissions
                .iter()
                .all(|perm| role_permissions.contains(perm))
        })
        .cloned()
        .collect()
}
```

### 示例

**Planner 角色**:
```
拥有权限: [ReadFiles]

read_file (需要: [ReadFiles]) → ✅ 可用
search_code (需要: [ReadFiles]) → ✅ 可用
update_file (需要: [ReadFiles, WriteFiles]) → ❌ 缺少 WriteFiles
delete_file (需要: [ReadFiles, DeleteFiles]) → ❌ 缺少 DeleteFiles
```

**Actor 角色**:
```
拥有权限: [ReadFiles, WriteFiles, CreateFiles, DeleteFiles, ExecuteCommands]

所有工具 → ✅ 全部可用
```

---

## 💾 Context Manager 集成

### ChatConfig 更新

```rust
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub agent_role: AgentRole,  // NEW: 存储当前角色
}
```

### 关键字段

- **`agent_role: AgentRole`**
  - 存储当前激活的角色
  - 持久化到数据库
  - 影响工具过滤和 System Prompt

### 角色切换 API

```
POST /v1/contexts/{id}/role
Body: { "role": "Planner" | "Actor" }

Response: {
  "success": true,
  "current_role": "Actor",
  "available_permissions": ["ReadFiles", "WriteFiles", ...]
}
```

---

## 🎨 前端 UI 设计

### 角色选择器

```typescript
interface RoleInfo {
  role: AgentRole;
  displayName: string;
  icon: string;
  color: string;
  description: string;
  permissions: Permission[];
}

const ROLES: RoleInfo[] = [
  {
    role: "Planner",
    displayName: "规划者",
    icon: "🔍",
    color: "#3B82F6",  // 蓝色
    description: "分析和规划，只读权限",
    permissions: ["ReadFiles"],
  },
  {
    role: "Actor",
    displayName: "执行者",
    icon: "⚡",
    color: "#10B981",  // 绿色
    description: "执行计划，完整权限",
    permissions: ["ReadFiles", "WriteFiles", "CreateFiles", "DeleteFiles", "ExecuteCommands"],
  },
];
```

### 角色显示

```tsx
<div className="role-indicator" style={{ color: roleInfo.color }}>
  <span className="role-icon">{roleInfo.icon}</span>
  <span className="role-name">{roleInfo.displayName}</span>
  <Tooltip>
    <div>权限: {roleInfo.permissions.join(", ")}</div>
  </Tooltip>
</div>
```

---

## 📊 对比：Mode vs Role

### 旧设计（Mode）
```
❌ 只有 Plan/Act 两种模式
❌ 扩展性差
❌ 权限隐含在模式中
❌ 难以添加新行为
```

### 新设计（Role）
```
✅ 可扩展到多种角色
✅ 权限系统独立定义
✅ 每个角色清晰的职责
✅ 易于添加新角色
✅ 符合最小权限原则
✅ 未来可支持角色组合
```

---

## 🎯 核心优势

### 1. 可扩展性
- 添加新角色无需修改核心架构
- 权限系统独立于角色定义
- 每个角色有独立的 System Prompt

### 2. 安全性
- 明确的权限边界
- 最小权限原则
- 权限检查在运行时强制执行

### 3. 清晰性
- 用户清楚当前角色的能力
- System Prompt 明确告诉 AI 它的权限
- 前端显示角色和权限信息

### 4. 灵活性
- 未来可以支持角色组合
- 可以添加自定义权限
- 可以支持临时权限提升

---

## 📋 实现清单

### Phase 1: 核心角色系统
- [ ] 定义 `AgentRole` 枚举
- [ ] 定义 `Permission` 枚举
- [ ] 实现 `role.permissions()` 方法
- [ ] 更新 `ChatConfig` 添加 `agent_role`
- [ ] 数据库迁移

### Phase 2: 权限过滤
- [ ] 更新 `ToolDefinition` 添加 `required_permissions`
- [ ] 实现 `filter_tools_for_role()`
- [ ] 标记所有现有工具的权限要求
- [ ] 运行时权限检查

### Phase 3: 角色特定 Prompts
- [ ] 创建 Planner 角色 Prompt 模板
- [ ] 创建 Actor 角色 Prompt 模板
- [ ] 实现 Prompt 注入逻辑
- [ ] 测试不同角色的行为

### Phase 4: 前端集成
- [ ] 创建 `RoleSelector` 组件
- [ ] 显示当前角色和权限
- [ ] 角色切换 API 调用
- [ ] 角色特定的 UI 样式

### Phase 5: 未来角色
- [ ] 设计 Commander 角色
- [ ] 设计 Designer 角色
- [ ] 设计 Reviewer 角色
- [ ] 设计 Tester 角色

---

## ✅ 验证

```bash
$ openspec validate add-plan-act-agent-architecture --strict
✅ Change 'add-plan-act-agent-architecture' is valid
```

---

## 🎉 总结

你的建议非常正确！从 "模式" 提升到 "角色" 是一个重大的架构改进：

### 核心改进
1. **AgentRole 枚举** - 可扩展到未来角色
2. **Permission 系统** - 细粒度权限控制
3. **工具权限要求** - 工具声明所需权限
4. **角色过滤** - 运行时强制权限检查
5. **独立 Prompts** - 每个角色有定制的指令

### 当前角色
- **Planner** - 只读分析和规划
- **Actor** - 完整权限执行

### 未来角色
- **Commander** - 协调和委派
- **Designer** - 创建但不修改
- **Reviewer** - 审查和反馈
- **Tester** - 测试但不改源码

这个架构为未来的扩展提供了坚实的基础！🚀


