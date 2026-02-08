# Agent Role System Design - Updated 🎭

**Date**: 2025-11-02
**OpenSpec Change**: `add-plan-act-agent-architecture`
**Architecture**: **Role System** rather than simple mode switching

---

## 🎯 Core Design Philosophy

### From "Mode" to "Role"

**Previous Approach**: Mode
```
Plan Mode ↔ Act Mode
```

**New Architecture**: Role + Permissions
```
AgentRole::Planner + Permissions::ReadFiles
AgentRole::Actor + Permissions::[Read, Write, Delete, Execute]
Future: Commander, Designer, Reviewer, Tester...
```

---

## 🏗️ Architecture Core Components

### 1. AgentRole Enum (Extensible)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentRole {
    Planner,  // Planner - read-only analysis
    Actor,    // Actor - full permissions

    // Future extensions:
    // Commander,  // Commander - coordinates other roles
    // Designer,   // Designer - creates but doesn't modify
    // Reviewer,   // Reviewer - read-only feedback
    // Tester,     // Tester - read-only + execute tests
}
```

### 2. Permission System

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Permission {
    ReadFiles,          // Read files
    WriteFiles,         // Write files
    CreateFiles,        // Create files
    DeleteFiles,        // Delete files
    ExecuteCommands,    // Execute commands
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

### 3. Tool Permission Requirements

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub required_permissions: Vec<Permission>,  // New field
    // ...
}

// Examples:
ToolDefinition {
    name: "read_file",
    required_permissions: vec![Permission::ReadFiles],
}

ToolDefinition {
    name: "update_file",
    required_permissions: vec![
        Permission::ReadFiles,   // Need to read existing content
        Permission::WriteFiles,  // Need to write modifications
    ],
}

ToolDefinition {
    name: "delete_file",
    required_permissions: vec![
        Permission::ReadFiles,   // Need to confirm file exists
        Permission::DeleteFiles, // Need delete permission
    ],
}
```

---

## 🎭 Currently Implemented Two Roles

### Role 1: Planner

**Responsibilities**:
- 📖 Read and analyze code
- 🔍 Search and explore
- 📋 Create execution plans
- 💬 Discuss solutions with user

**Permissions**:
```rust
vec![Permission::ReadFiles]
```

**Available Tools**:
- ✅ `read_file` - Read files
- ✅ `search_code` - Search code
- ✅ `list_directory` - List directories
- ✅ `grep` - Text search
- ✅ `find_references` - Find references

**Unavailable Tools**:
- ❌ `update_file` - requires WriteFiles
- ❌ `create_file` - requires CreateFiles
- ❌ `delete_file` - requires DeleteFiles
- ❌ `execute_command` - requires ExecuteCommands

**System Prompt Characteristics**:
```
# CURRENT ROLE: PLANNER

YOUR PERMISSIONS:
- ✅ Read files, search code, list directories
- ❌ Write, create, or delete files
- ❌ Execute commands

YOUR GOAL:
Create a detailed plan for the user to review and approve.
```

### Role 2: Actor

**Responsibilities**:
- ⚡ Execute approved plans
- 🔧 Modify and create files
- 🤖 Autonomously make small adjustments
- ❓ Ask user for large changes

**Permissions**:
```rust
vec![
    Permission::ReadFiles,
    Permission::WriteFiles,
    Permission::CreateFiles,
    Permission::DeleteFiles,
    Permission::ExecuteCommands,
]
```

**Available Tools**: All tools (filtered by permissions)

**System Prompt Characteristics**:
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

## 🚀 Future Extensible Role Examples

### Commander

**Concept**: High-level coordination, doesn't directly operate on files

```rust
AgentRole::Commander => vec![
    Permission::ReadFiles,
    // Special permissions (future implementation):
    // Permission::DelegateToRole,
    // Permission::CoordinateWorkflow,
]
```

**Use Cases**:
- Formulate multi-step strategies
- Coordinate Planner and Actor
- Don't directly modify files

### Designer

**Concept**: Create new content, don't modify existing

```rust
AgentRole::Designer => vec![
    Permission::ReadFiles,
    Permission::CreateFiles,
    // Note: no WriteFiles and DeleteFiles
]
```

**Use Cases**:
- Create new components
- Generate boilerplate code
- Cannot modify existing files

### Reviewer

**Concept**: Code review, purely read-only

```rust
AgentRole::Reviewer => vec![
    Permission::ReadFiles,
    // Read-only for review
]
```

**Use Cases**:
- Code review
- Output structured feedback
- Identify issues and improvements

### Tester

**Concept**: Run tests, don't modify source code

```rust
AgentRole::Tester => vec![
    Permission::ReadFiles,
    Permission::ExecuteCommands, // For running tests
    // Note: no write permissions
]
```

**Use Cases**:
- Run test suites
- Execute check commands
- Report test results

---

## 🔐 Permission Filtering Mechanism

### Tool Filtering Flow

```rust
fn filter_tools_for_role(
    all_tools: &[ToolDefinition],
    role: &AgentRole,
) -> Vec<ToolDefinition> {
    let role_permissions = role.permissions();

    all_tools
        .iter()
        .filter(|tool| {
            // All required permissions of tool must be owned by role
            tool.required_permissions
                .iter()
                .all(|perm| role_permissions.contains(perm))
        })
        .cloned()
        .collect()
}
```

### Examples

**Planner Role**:
```
Owned permissions: [ReadFiles]

read_file (requires: [ReadFiles]) → ✅ Available
search_code (requires: [ReadFiles]) → ✅ Available
update_file (requires: [ReadFiles, WriteFiles]) → ❌ Missing WriteFiles
delete_file (requires: [ReadFiles, DeleteFiles]) → ❌ Missing DeleteFiles
```

**Actor Role**:
```
Owned permissions: [ReadFiles, WriteFiles, CreateFiles, DeleteFiles, ExecuteCommands]

All tools → ✅ All available
```

---

## 💾 Context Manager Integration

### ChatConfig Update

```rust
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub agent_role: AgentRole,  // NEW: Store current role
}
```

### Key Fields

- **`agent_role: AgentRole`**
  - Stores currently active role
  - Persisted to database
  - Affects tool filtering and System Prompt

### Role Switching API

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

## 🎨 Frontend UI Design

### Role Selector

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
    displayName: "Planner",
    icon: "🔍",
    color: "#3B82F6",  // Blue
    description: "Analyze and plan, read-only permissions",
    permissions: ["ReadFiles"],
  },
  {
    role: "Actor",
    displayName: "Actor",
    icon: "⚡",
    color: "#10B981",  // Green
    description: "Execute plans, full permissions",
    permissions: ["ReadFiles", "WriteFiles", "CreateFiles", "DeleteFiles", "ExecuteCommands"],
  },
];
```

### Role Display

```tsx
<div className="role-indicator" style={{ color: roleInfo.color }}>
  <span className="role-icon">{roleInfo.icon}</span>
  <span className="role-name">{roleInfo.displayName}</span>
  <Tooltip>
    <div>Permissions: {roleInfo.permissions.join(", ")}</div>
  </Tooltip>
</div>
```

---

## 📊 Comparison: Mode vs Role

### Old Design (Mode)
```
❌ Only Plan/Act two modes
❌ Poor extensibility
❌ Permissions implied in modes
❌ Difficult to add new behaviors
```

### New Design (Role)
```
✅ Extensible to multiple roles
✅ Permission system independently defined
✅ Clear responsibilities for each role
✅ Easy to add new roles
✅ Follows principle of least privilege
✅ Future support for role composition
```

---

## 🎯 Core Advantages

### 1. Extensibility
- Add new roles without modifying core architecture
- Permission system independent of role definition
- Each role has independent System Prompt

### 2. Security
- Clear permission boundaries
- Principle of least privilege
- Permission checks enforced at runtime

### 3. Clarity
- Users understand current role capabilities
- System Prompt clearly tells AI its permissions
- Frontend displays role and permission information

### 4. Flexibility
- Future support for role composition
- Can add custom permissions
- Can support temporary permission elevation

---

## 📋 Implementation Checklist

### Phase 1: Core Role System
- [ ] Define `AgentRole` enum
- [ ] Define `Permission` enum
- [ ] Implement `role.permissions()` method
- [ ] Update `ChatConfig` to add `agent_role`
- [ ] Database migration

### Phase 2: Permission Filtering
- [ ] Update `ToolDefinition` to add `required_permissions`
- [ ] Implement `filter_tools_for_role()`
- [ ] Mark permission requirements for all existing tools
- [ ] Runtime permission checks

### Phase 3: Role-Specific Prompts
- [ ] Create Planner role Prompt template
- [ ] Create Actor role Prompt template
- [ ] Implement Prompt injection logic
- [ ] Test behaviors of different roles

### Phase 4: Frontend Integration
- [ ] Create `RoleSelector` component
- [ ] Display current role and permissions
- [ ] Role switching API calls
- [ ] Role-specific UI styles

### Phase 5: Future Roles
- [ ] Design Commander role
- [ ] Design Designer role
- [ ] Design Reviewer role
- [ ] Design Tester role

---

## ✅ Validation

```bash
$ openspec validate add-plan-act-agent-architecture --strict
✅ Change 'add-plan-act-agent-architecture' is valid
```

---

## 🎉 Summary

Your suggestion is absolutely correct! Elevating from "mode" to "role" is a significant architectural improvement:

### Core Improvements
1. **AgentRole Enum** - Extensible to future roles
2. **Permission System** - Fine-grained permission control
3. **Tool Permission Requirements** - Tools declare required permissions
4. **Role Filtering** - Runtime permission check enforcement
5. **Independent Prompts** - Each role has customized instructions

### Current Roles
- **Planner** - Read-only analysis and planning
- **Actor** - Full permission execution

### Future Roles
- **Commander** - Coordination and delegation
- **Designer** - Create but don't modify
- **Reviewer** - Review and feedback
- **Tester** - Test but don't modify source

This architecture provides a solid foundation for future extensions! 🚀


