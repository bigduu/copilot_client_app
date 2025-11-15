# Agent Role System - Design Document

## Context

Current agent system executes tool calls immediately without role-based permissions. We need a role-based architecture:

1. **Role System**: Extensible framework for different agent behaviors
2. **Permission Model**: Each role has specific tool access permissions
3. **Current Roles**: Planner (read-only planning) and Actor (execution)
4. **Future Extensibility**: Support for Commander, Designer, Reviewer, Tester, etc.

### Stakeholders

- **Backend developers**: Implement mode detection and tool filtering
- **Frontend developers**: Implement mode selector and message type rendering
- **End users**: Benefit from reviewable plans and controlled execution

### Constraints

- Must be backward compatible with existing chats
- Plan mode must be truly read-only (security requirement)
- Act mode must maintain current tool capabilities
- Frontend must gracefully handle both old and new message formats

## Goals / Non-Goals

### Goals

- ✅ Enable users to review complete plan before execution
- ✅ Separate exploration (read-only) from modification (write)
- ✅ Allow agent autonomy within approved plan
- ✅ Provide structured UI for plans and questions
- ✅ Manual mode switching for user control

### Non-Goals

- ❌ Automatic plan approval (always require user confirmation)
- ❌ Automatic mode switching (user must explicitly switch)
- ❌ Sub-workflows or nested planning (keep simple)
- ❌ Plan versioning or history (for future enhancement)

## Decisions

### Decision 1: Role-Based Architecture

**What**: Agent roles are distinct identities with different permissions and behaviors.

**Why**:

- Clear separation of concerns
- Extensible to future roles (Commander, Designer, etc.)
- Permission-based access control
- Each role has tailored system prompt
- Easier to reason about security implications
- Follows principle of least privilege

**How**:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentRole {
    Planner,  // Read-only planning role
    Actor,    // Execution role with full permissions
    // Future: Commander, Designer, Reviewer, Tester, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Permission {
    ReadFiles,
    WriteFiles,
    CreateFiles,
    DeleteFiles,
    ExecuteCommands,
}

pub struct RolePermissions {
    pub role: AgentRole,
    pub permissions: Vec<Permission>,
}

impl AgentRole {
    pub fn permissions(&self) -> Vec<Permission> {
        match self {
            AgentRole::Planner => vec![Permission::ReadFiles],
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

### Decision 2: Manual Role Switching

**What**: User must manually switch between roles (Planner → Actor).

**Why**:

- User maintains control over execution
- Prevents accidental execution with wrong permissions
- Clear approval checkpoint
- Matches user mental model
- Security boundary between roles

**Alternatives considered**:

- **Automatic switch after plan**: Too implicit, could surprise users
- **Prompt user to switch**: Adds extra step, less clear
- **Plan includes execute command**: Complex to implement
- **Single role with dynamic permissions**: Less clear, harder to extend

### Decision 3: Structured Message Types

**What**: Messages have explicit `message_type` field for frontend rendering.

**Format**:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageType {
    Text,        // Regular conversation
    Plan,        // Structured execution plan
    Question,    // Agent asking for clarification/approval
    ToolCall,    // Tool invocation
    ToolResult,  // Tool execution result
}

pub struct InternalMessage {
    pub role: Role,
    pub content: Vec<ContentPart>,
    pub message_type: MessageType,  // NEW
    // ... other fields
}
```

**Why**:

- Frontend can render specialized UI
- Easy to extend with new types
- Backward compatible (default to Text)
- Clear semantic meaning

### Decision 4: Plan Message Format

**What**: Plans are structured JSON embedded in message content.

**Format**:

```json
{
  "type": "plan",
  "goal": "User's objective in natural language",
  "steps": [
    {
      "step_number": 1,
      "action": "Read the configuration file",
      "reason": "Need to understand current settings",
      "tools_needed": ["read_file"],
      "estimated_time": "~1 second"
    },
    {
      "step_number": 2,
      "action": "Modify the config to enable feature X",
      "reason": "Requested by user",
      "tools_needed": ["update_file"],
      "estimated_time": "~2 seconds"
    }
  ],
  "estimated_total_time": "~5 seconds",
  "risks": ["May need to restart service after config change"],
  "prerequisites": []
}
```

**Why**:

- Clear step-by-step breakdown
- Reasoning for each step (auditable)
- Tools listed (user knows what will be used)
- Risks highlighted upfront

**Prompt Template**:

```
When in PLAN mode, output your plan in this exact JSON format:

{
  "goal": "Brief summary of what we're trying to accomplish",
  "steps": [
    {
      "step_number": 1,
      "action": "What you will do",
      "reason": "Why this is necessary",
      "tools_needed": ["list", "of", "tools"],
      "estimated_time": "rough estimate"
    }
  ],
  "estimated_total_time": "total time estimate",
  "risks": ["list any potential issues"],
  "prerequisites": ["anything user needs to prepare"]
}

After presenting the plan, discuss it with the user. When they approve,
they will switch to ACT mode for execution.
```

### Decision 5: Question Message Format

**What**: Act agent asks questions using structured format.

**Format**:

```json
{
  "type": "question",
  "question": "Should I also update the test files to match?",
  "context": "I noticed the test files still use the old API. This wasn't in the original plan.",
  "severity": "minor",
  "options": [
    {
      "label": "Yes, update tests",
      "value": "update_tests",
      "description": "Update test files to match the new API"
    },
    {
      "label": "No, skip tests",
      "value": "skip_tests",
      "description": "Leave test files as-is for now"
    },
    {
      "label": "Stop and let me review",
      "value": "pause",
      "description": "Pause execution to review changes"
    }
  ],
  "default": "skip_tests",
  "allow_custom": false
}
```

**Why**:

- Clear presentation of options
- Context explains why asking
- Severity helps user prioritize
- Default reduces friction
- Custom answers optional

**Prompt Template**:

```
When in ACT mode, if you encounter a situation that requires user decision:

{
  "type": "question",
  "question": "Clear question for the user",
  "context": "Why you're asking / what you discovered",
  "severity": "critical" | "major" | "minor",
  "options": [
    {
      "label": "Short label",
      "value": "internal_value",
      "description": "Longer explanation"
    }
  ],
  "default": "recommended_value"
}

Guidelines for when to ask:
- ALWAYS ask for: Deleting files, major refactors, security-sensitive changes
- USUALLY ask for: Changes beyond original plan, uncertainty about approach
- RARELY ask for: Minor formatting, obvious fixes, style adjustments
```

### Decision 6: Permission-Based Tool Access

**What**: Tools specify required permissions; roles grant permissions.

**Implementation**:

```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Vec<Parameter>,
    pub requires_approval: bool,
    pub required_permissions: Vec<Permission>,  // NEW
    // ... other fields
}

pub enum Permission {
    ReadFiles,
    WriteFiles,
    CreateFiles,
    DeleteFiles,
    ExecuteCommands,
}
```

**Tool Examples**:

- **Read Tools** (require `ReadFiles`):
  - `read_file`, `list_directory`, `search_code`
  - `search_symbol`, `get_file_info`, `grep`
- **Write Tools** (require `WriteFiles`):
  - `update_file`: requires `[ReadFiles, WriteFiles]`
- **Create Tools** (require `CreateFiles`):
  - `create_file`: requires `[WriteFiles, CreateFiles]`
- **Delete Tools** (require `DeleteFiles`):
  - `delete_file`: requires `[ReadFiles, DeleteFiles]`
- **Execute Tools** (require `ExecuteCommands`):
  - `execute_command`: requires `[ExecuteCommands]`

**Why**:

- Granular permission control
- Tools can require multiple permissions
- Easy to add new permissions
- Roles grant specific permission sets
- Clear security boundary
- Extensible for future tool types and roles

### Decision 7: Role-Specific System Prompts

**What**: Different prompt instructions based on active role and permissions.

**Planner Role Prompt Addition**:

```
# CURRENT ROLE: PLANNER

You are operating in the PLANNER role. Your responsibilities:
1. Analyze the user's request thoroughly
2. Read necessary files and information (read-only access)
3. Create a detailed step-by-step plan
4. Discuss the plan with the user
5. Refine based on feedback

YOUR PERMISSIONS:
- ✅ Read files, search code, list directories
- ❌ Write, create, or delete files
- ❌ Execute commands

IMPORTANT:
- You CANNOT modify any files in this role
- Available tools: read_file, search_code, list_directory, grep, etc.
- If you need write access, user must switch to ACTOR role
- After plan approval, user will switch you to ACTOR role

Output your plan in the following JSON format...
```

**Actor Role Prompt Addition**:

```
# CURRENT ROLE: ACTOR

You are operating in the ACTOR role. Your responsibilities:
1. Execute the approved plan
2. Use all available tools to accomplish tasks
3. Make small adjustments as needed
4. Ask for approval on major changes

YOUR PERMISSIONS:
- ✅ Read, write, create, delete files
- ✅ Execute commands
- ✅ Full tool access

AUTONOMY GUIDELINES:
- Small changes: Proceed (formatting, obvious fixes)
- Medium changes: Mention but proceed
- Large changes: Ask via question format (delete files, major refactors)

When you need to ask, use this format...
```

**Future Role Prompt Example (Commander)**:

```
# CURRENT ROLE: COMMANDER

You are operating in the COMMANDER role. Your responsibilities:
1. Orchestrate high-level strategy
2. Delegate tasks to specialized roles
3. Coordinate multi-role workflows

YOUR PERMISSIONS:
- ✅ Read files and system state
- ❌ Direct file modifications (delegate to ACTOR)
- ✅ Switch other agents between roles
```

**Why**:

- Clear instructions for each role
- AI understands permissions
- Role-specific behaviors
- Extensible to new roles
- Security through clarity

## Architecture

### Backend Flow

```
User Message → ChatService
  ↓
Check agent_mode in chat config
  ↓
  ├── Plan Mode:
  │   ├── Filter tools (read-only only)
  │   ├── Add Plan mode prompt instructions
  │   ├── Send to LLM
  │   ├── Parse response
  │   │   ├── If plan JSON → Set message_type = Plan
  │   │   └── If text → Set message_type = Text
  │   └── Return to user
  │
  └── Act Mode:
      ├── Allow all tools
      ├── Add Act mode prompt instructions
      ├── Send to LLM
      ├── Parse response
      │   ├── If tool call → Execute
      │   ├── If question JSON → Set message_type = Question
      │   └── If text → Set message_type = Text
      └── Return to user (or loop if tool executed)
```

### Frontend Flow

```
Receive Message
  ↓
Check message.message_type
  ↓
  ├── Text → Render as normal MessageCard
  ├── Plan → Render as PlanMessageCard
  │           (Shows numbered steps, tools, risks)
  ├── Question → Render as QuestionMessageCard
  │              (Shows options as buttons)
  ├── ToolCall → Render as ToolCallCard (if approval needed)
  └── ToolResult → Render inline or collapsed
```

### Mode Switching Flow

```
User in Plan Mode
  ↓
Reviews Plan
  ↓
Clicks "Execute Plan" button
  ↓
Frontend: POST /context/{id}/mode
  Body: { "mode": "act" }
  ↓
Backend: Updates chat.config.agent_mode
  ↓
Backend: Returns confirmation
  ↓
Frontend: Updates UI to show Act mode
  ↓
User can now continue conversation in Act mode
```

## Data Model Changes

### Context Config

```rust
pub struct ChatConfig {
    pub model_id: String,
    pub mode: String,
    pub system_prompt_id: Option<String>,
    pub agent_role: AgentRole,  // NEW: Planner or Actor (extensible)
}

pub enum AgentRole {
    Planner,
    Actor,
    // Future: Commander, Designer, Reviewer, Tester
}

pub enum Permission {
    ReadFiles,
    WriteFiles,
    CreateFiles,
    DeleteFiles,
    ExecuteCommands,
}
```

### Message Structure

```rust
pub struct InternalMessage {
    pub role: Role,
    pub content: Vec<ContentPart>,
    pub message_type: MessageType,  // NEW
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_result: Option<ToolResult>,
    pub created_at: i64,
}
```

## Risks / Trade-offs

### Risk: Plan May Become Outdated

- **Mitigation**: Show timestamp on plan, allow re-planning

### Risk: Act Mode Asks Too Many Questions

- **Mitigation**: Clear guidelines in prompt, severity levels

### Risk: User Forgets to Switch Modes

- **Mitigation**: Clear UI indicator, prompts to switch when appropriate

### Risk: Plan Format Parsing Failures

- **Mitigation**: Graceful fallback to text rendering, validation

## Migration Plan

### Phase 1: Add Fields (Backward Compatible)

1. Add `agent_mode` to ChatConfig (default: Act for existing chats)
2. Add `message_type` to InternalMessage (default: Text)
3. Add `read_only` to ToolDefinition (default: false)
4. Deploy backend changes

### Phase 2: Implement Plan Mode

1. Add mode-specific prompt injection
2. Add tool filtering by mode
3. Add plan JSON parsing
4. Test plan mode thoroughly

### Phase 3: Frontend Updates

1. Add AgentModeSelector component
2. Add PlanMessageCard component
3. Add QuestionMessageCard component
4. Add mode switching API calls

### Phase 4: Implement Act Mode Enhancements

1. Add question JSON parsing
2. Add question handling flow
3. Test question interactions

### Phase 5: Testing & Refinement

1. End-to-end testing
2. Prompt refinement
3. UI/UX polish
4. Documentation

## Open Questions

1. **Should we allow switching from Act back to Plan?**
   - Answer: Yes, but warn user that execution will stop

2. **Should plans be saved separately from chat history?**
   - Answer: For MVP, no. Plans are just messages. Consider for v2.

3. **How to handle plan that becomes invalid during Act mode?**
   - Answer: Agent mentions discrepancy, asks via question format

4. **Should we version the plan/question JSON formats?**
   - Answer: Yes, add `format_version: "1.0"` field for future compatibility
