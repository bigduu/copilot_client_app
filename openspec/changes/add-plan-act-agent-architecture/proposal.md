# Add Agent Role System with Plan and Act Roles

## Why

Current agent system executes tool calls immediately without clear planning phase. This creates several issues:
1. Users cannot review the complete execution plan before tools start modifying files
2. No clear separation between read-only exploration and write operations
3. Agent cannot have focused discussion about approach before committing to actions
4. Difficult to audit what the agent intends to do vs what it actually did
5. No extensible system for adding different agent behaviors with different permissions

The Agent Role System introduces **role-based agent execution** with distinct permissions:
- **Planner Role**: Read-only analysis and planning, discusses approach with user
- **Actor Role**: Executes approved plan, can make small adjustments but asks for major changes
- **Extensible**: Framework supports future roles (Commander, Designer, Reviewer, etc.)

Each role has:
- Distinct system prompt instructions
- Specific tool access permissions
- Clear capability boundaries

## What Changes

### **NEW** Agent Role System
- Introduce `AgentRole` enum to replace simple mode concept
- Each role defines:
  - System prompt template
  - Permission set (tool access, file operations)
  - Behavior guidelines
  - Output format expectations
- Roles stored in chat context configuration
- Extensible architecture for adding new roles

### **NEW** Planner Role
- Agent operates with **read-only permissions** for planning phase
- **Permissions**: Can read files, search code, list directories
- **Restrictions**: Cannot write, create, delete files or execute commands
- **Outputs**: Structured plan with numbered steps, reasoning, and estimated risks
- **Interaction**: Can have multiple rounds of discussion to refine plan
- **Transition**: User manually switches to Actor role after approving plan

### **NEW** Actor Role
- Agent executes with **full tool permissions**
- **Permissions**: Can read, write, create, delete files and execute commands
- **Autonomy**: Can make small adjustments during execution
- **Approval Gates**: Must ask user for approval on major changes via question format
- **Outputs**: Can output questions when uncertain or deviating significantly
- **Execution**: Continues until plan complete or blocked

### **NEW** Message Type System
- Context Manager adds `message_type` field to messages
- Types: `text`, `plan`, `question`, `tool_call`, `tool_result`
- Frontend renders different UI based on message type
- Plan messages show structured step-by-step layout
- Question messages show interactive choice buttons

### **NEW** Role Permission System
- Define permission sets for each role
- Permissions include: read_files, write_files, delete_files, execute_commands
- Tool access filtered based on role permissions
- Future roles can define custom permission combinations

### **NEW** Role Switching Mechanism
- User explicitly switches between roles (Planner ↔ Actor)
- Current role stored in chat context configuration
- UI shows current role clearly with role-specific styling
- System prompt and tool access change based on role

### **MODIFIED** Tool System
- Tools marked with required permissions (e.g., needs_write_permission)
- Tool access filtered by current role's permissions
- Planner role only gets read-only tools
- Actor role gets all tools
- Tool approval logic considers current role

## Impact

### Affected Specs
- **NEW**: `plan-act-agent-architecture` - Two-phase agent execution
- **NEW**: `agent-message-types` - Structured message type system
- **MODIFIED**: `tool-system` - Add read-only flag to tool definitions
- **MODIFIED**: `context-manager` - Add mode field and message type field
- **MODIFIED**: `frontend-agent-ui` - Render plan and question message types

### Affected Code

#### Backend (Rust)
- `context_manager/structs/context.rs` - Add `agent_mode` field
- `context_manager/structs/message.rs` - Add `message_type` enum
- `crates/tool_system/src/types/tool.rs` - Add `read_only` flag
- `crates/web_service/src/services/agent_service.rs` - Add mode-aware tool filtering
- **NEW**: `crates/web_service/src/services/plan_agent_service.rs` - Plan agent logic
- **NEW**: `crates/web_service/src/services/act_agent_service.rs` - Act agent logic

#### Frontend (TypeScript)
- `src/types/message.ts` - Add MessageType enum
- `src/components/MessageCard/` - Add PlanMessageCard and QuestionMessageCard
- **NEW**: `src/components/AgentModeSelector/` - UI for switching modes
- **NEW**: `src/components/PlanMessageCard/` - Render structured plans
- **NEW**: `src/components/QuestionMessageCard/` - Render interactive questions
- `src/store/chatSlice.ts` - Add agent_mode to chat config

### Migration Notes
- Existing chats default to Act mode (backward compatible)
- No breaking changes to existing tool system
- Frontend gracefully handles old messages without message_type


