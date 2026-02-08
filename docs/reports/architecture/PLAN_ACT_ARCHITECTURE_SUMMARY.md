# Plan-Act Agent Architecture - Creation Complete ✅

**Date**: 2025-11-02
**OpenSpec Change**: `add-plan-act-agent-architecture`
**Status**: ✅ **Specification Created and Validated**

---

## 📋 All Requested Designs Have Been Implemented

Based on your requirements, I have created a complete OpenSpec change specification:

### ✅ 1. Plan Agent Output Format and Frontend Rendering

**Your Requirement**:
> Plan Agent replies in JSON format, Context Manager provides an easy-to-identify field to the frontend

**Implemented**:
```typescript
// New message type system
type MessageType = "text" | "plan" | "question" | "tool_call" | "tool_result"

// Plan message format
{
  "type": "plan",
  "goal": "User's goal",
  "steps": [
    {
      "step_number": 1,
      "action": "What to do",
      "reason": "Why",
      "tools_needed": ["Required tools"],
      "estimated_time": "Estimated time"
    }
  ],
  "estimated_total_time": "Total time",
  "risks": ["Potential risks"],
  "prerequisites": ["Prerequisites"]
}
```

**Frontend Components**:
- `PlanMessageCard` - Renders beautiful plan cards
- Displays numbered steps, tools, risks
- "Execute Plan" and "Optimize Plan" buttons

---

### ✅ 2. Plan Agent Read-Only Permission and Manual Switch

**Your Requirement**:
> Plan cannot modify files, can only read. After making a plan, the user manually switches to Act mode

**Implemented**:

#### Plan Mode Restrictions:
```rust
pub enum AgentMode {
    Plan,  // Read-only mode
    Act,   // Execution mode
}

pub struct ToolDefinition {
    pub read_only: bool,  // New field
    // ...
}
```

**Tool Classification**:
- **Available in Plan Mode** (read_only=true):
  - `read_file`, `search_code`, `list_directory`
  - `grep`, `find_references`, `get_file_info`

- **Available in Act Mode** (read_only=false):
  - `update_file`, `create_file`, `delete_file`
  - `rename_file`, `execute_command`

**Manual Switch**:
- User clicks "Execute Plan" button
- API: `POST /v1/contexts/{id}/mode { "mode": "act" }`
- Mode persisted to chat configuration
- UI clearly displays current mode

---

### ✅ 3. Act Agent Autonomy and Question Mechanism

**Your Requirement**:
> Act Agent has autonomy. For major changes, it should ask the user using question JSON format

**Implemented**:

#### Autonomy Rules (in Prompt):
```
Small changes → Execute directly (formatting, obvious fixes)
Medium changes → Mention but continue
Large changes → Ask via question (delete files, major refactoring)
```

#### Question Format:
```json
{
  "type": "question",
  "question": "Should I also update the test files?",
  "context": "I noticed the test files use the old API, which was not in the original plan",
  "severity": "minor",  // critical, major, minor
  "options": [
    {
      "label": "Yes, update tests",
      "value": "update_tests",
      "description": "Update test files to match the new API"
    },
    {
      "label": "No, skip tests",
      "value": "skip_tests",
      "description": "Keep test files unchanged for now"
    },
    {
      "label": "Pause for review",
      "value": "pause",
      "description": "Pause execution so I can review the changes"
    }
  ],
  "default": "skip_tests"
}
```

#### Frontend Processing:
- Context Manager parses question JSON
- Sends to frontend for rendering
- `QuestionMessageCard` displays interactive option buttons
- User selects and sends answer
- Agent continues execution

---

## 📁 Created Files

### OpenSpec Change Directory:
```
openspec/changes/add-plan-act-agent-architecture/
├── proposal.md          ✅ Why, what, impact
├── design.md            ✅ Technical design, decisions, architecture
├── tasks.md             ✅ Implementation task list (10 sections, 100+ tasks)
└── specs/
    ├── plan-act-agent-architecture/
    │   └── spec.md      ✅ Core requirements specification
    ├── agent-message-types/
    │   └── spec.md      ✅ Message type system
    ├── tool-system/
    │   └── spec.md      ✅ Tool system modifications (read_only)
    └── context-manager/
        └── spec.md      ✅ Context Manager modifications
```

### Validation:
```bash
✅ openspec validate add-plan-act-agent-architecture --strict
   → Change 'add-plan-act-agent-architecture' is valid
```

---

## 🎯 Core Design Highlights

### 1. Two-Phase Execution
```
Plan Mode (Planning)              Act Mode (Execution)
      ↓                                  ↓
Read file analysis         →     Execute plan, modify files
Output structured plan     →     Autonomous adjustment + ask for major changes
User review discussion     →     Execute until completion
      ↓                                  ↓
Manual switch "Execute Plan" button
```

### 2. Message Type System
```typescript
Text        → Normal conversation
Plan        → Structured plan (special UI)
Question    → Interactive question (button options)
ToolCall    → Tool call (requires approval)
ToolResult  → Tool result (collapsible)
```

### 3. Frontend Rendering Strategy
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

## 🚀 Next Implementation Steps

### Recommended Implementation Order:

#### Phase 1: Data Model (1-2 days)
1. Add `AgentMode` enum
2. Add `MessageType` enum
3. Update `ChatConfig` and `InternalMessage`
4. Add `read_only` to tool definitions

#### Phase 2: Backend Services (2-3 days)
1. Implement mode-aware tool filtering
2. Implement Plan/Question parser
3. Implement mode-specific prompt injection
4. Add mode switching API

#### Phase 3: Frontend Components (2-3 days)
1. Create `AgentModeSelector`
2. Create `PlanMessageCard`
3. Create `QuestionMessageCard`
4. Update message routing logic

#### Phase 4: Prompt Engineering (1-2 days)
1. Write Plan mode prompt
2. Write Act mode prompt
3. Test and optimize

#### Phase 5: Testing and Optimization (2-3 days)
1. Unit tests
2. Integration tests
3. End-to-end tests
4. UX optimization

**Total Estimate**: 8-13 days

---

## 💡 Key Design Decisions

### Decision 1: Manual Mode Switch
- ✅ User maintains control
- ✅ Prevents accidental execution
- ✅ Clear approval checkpoints

### Decision 2: Structured Message Types
- ✅ Frontend can render specialized UI
- ✅ Easy to extend with new types
- ✅ Backward compatible (default Text)

### Decision 3: Read-Only Tool Flag
- ✅ Simple boolean flag
- ✅ Easy to enforce in AgentService
- ✅ Clear security boundary

### Decision 4: Autonomy Guidelines
- ✅ Rules defined in Prompt
- ✅ Severity levels (critical/major/minor)
- ✅ AI can judge when to ask

---

## 📖 Documentation Highlights

### Proposal.md Contains:
- Why this architecture is needed
- Specific changes
- Impacted code and specifications
- Migration instructions

### Design.md Contains:
- Detailed technical decisions and rationale
- Data model changes
- Architecture diagrams and flowcharts
- Risks and mitigation strategies
- Migration plan

### Tasks.md Contains:
- 10 major sections
- 100+ detailed tasks
- Each task is checkable for completion
- Clear dependency relationships

### Specs Contain:
- Complete requirements specifications
- Multiple scenarios for each requirement
- ADDED/MODIFIED clearly marked
- Verifiable acceptance criteria

---

## ✅ Validation Complete

```bash
$ openspec validate add-plan-act-agent-architecture --strict
✅ Change 'add-plan-act-agent-architecture' is valid
```

All specifications comply with OpenSpec format requirements:
- ✅ Each requirement has scenarios
- ✅ Scenarios use correct format
- ✅ Delta operations marked correctly
- ✅ File structure complete

---

## 🎉 Summary

Your Plan-Act Agent architecture design has been fully transformed into OpenSpec change specifications!

**Completed**:
1. ✅ Detailed proposal document
2. ✅ Complete technical design
3. ✅ 100+ task implementation checklist
4. ✅ 4 capability specification documents
5. ✅ OpenSpec validation passed

**Features**:
- 📋 Structured plan output (JSON format)
- 🔒 Plan mode read-only permissions
- 🔄 Manual mode switching
- ❓ Question-based approval mechanism
- 🎨 Different UI rendering on frontend
- 🤖 Act Agent autonomy

**Next Steps**:
1. Start implementation according to tasks.md
2. Or implement MVP (core features) first
3. Or discuss and refine the design

Ready to start implementation? Or any design adjustments needed? 🚀


