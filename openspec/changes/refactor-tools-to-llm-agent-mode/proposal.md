# Refactor Tools to LLM Agent Mode

## Why

The current tool system exposes all tools to the frontend for user selection and invocation. This creates several limitations:
1. Users must manually invoke tools with `/command` syntax
2. The LLM cannot autonomously use tools to accomplish tasks
3. No support for agent-style autonomous execution loops
4. Tool definitions and system prompt enhancement are scattered between frontend and backend
5. No clear separation between user-invoked actions (Workflows) and LLM-invoked actions (Tools)

This refactor enables **LLM-driven tool usage with agent loops** while introducing a new **Workflow system** for explicit user actions.

## What Changes

### **BREAKING** Tool System Refactor
- Tools are NO LONGER exposed to frontend via `/tools/available` endpoint
- Tools are injected into system prompt with strict JSON calling convention
- LLM generates structured JSON tool calls: `{"tool": "name", "parameters": {...}, "terminate": true/false}`
- Backend parses LLM output to detect tool calls and execute them
- Tool results are automatically fed back to LLM when `terminate: false` (Agent mode)
- Frontend only handles tool approval modals, not tool discovery/selection

### **NEW** Workflow System
- Workflows are user-invoked actions visible in the frontend UI
- Users trigger workflows via commands (e.g., `/create_project`) or UI buttons
- Workflows extract parameters from user input (similar to current tool handling)
- Workflows replace the current "tool selector" concept in the UI
- Categories apply to Workflows for organization

### **NEW** Agent Loop Execution
- Backend implements autonomous agent execution loop
- When LLM returns `terminate: false`, backend automatically:
  1. Executes the tool call
  2. Appends tool result to chat history
  3. Sends updated chat back to LLM
  4. Repeats until `terminate: true` is received
- Agent loop is transparent to frontend (frontend sees final result)

### **MODIFIED** System Prompt Management
- System prompt enhancement (tool injection) moves to **backend**
- **Two modes**: 
  - **Passthrough mode** (`/v1/chat/completions`): Uses base prompt without enhancement (for external clients like Cline)
  - **Context mode** (`/context/*`): Uses enhanced prompt with tools (for our frontend)
- Backend provides endpoint to get "enhanced prompt" (base + tools + mermaid)
- Frontend no longer needs to know about tool definitions
- Base system prompt CRUD remains unchanged (`/v1/system-prompts/*`)
- Maintains OpenAI API compatibility for external integrations

### **MODIFIED** Category System
- Categories now apply to **Workflows** instead of Tools
- Categories determine which workflows appear in frontend UI
- Tool categories are internal to backend (for system prompt organization)

## Impact

### Affected Specs
- **NEW**: `tool-system` - LLM-driven tool invocation with JSON format and agent loops
- **NEW**: `workflow-system` - User-invoked actions with parameter extraction
- **NEW**: `system-prompt-enhancement` - Backend-driven prompt augmentation
- **MODIFIED**: `frontend-workflow-ui` - Replace tool selector with workflow selector

### Affected Code

#### Backend (Rust)
- `crates/tool_system/` - Add JSON output format, termination flag support
- `crates/web_service/src/controllers/tool_controller.rs` - Remove/refactor tool listing endpoint
- `crates/web_service/src/controllers/openai_controller.rs` - Add agent loop logic
- `crates/web_service/src/controllers/system_prompt_controller.rs` - Add enhancement endpoint
- `crates/web_service/src/services/tool_service.rs` - Add tool-to-prompt conversion
- **NEW**: `crates/workflow_system/` - Workflow definitions and execution
- **NEW**: `crates/web_service/src/services/agent_service.rs` - Agent loop orchestration

#### Frontend (TypeScript)
- `src/services/ToolService.ts` - Remove tool listing, keep execution
- **NEW**: `src/services/WorkflowService.ts` - Workflow invocation and parameter handling
- `src/services/SystemPromptEnhancer.ts` - Remove (logic moves to backend)
- `src/components/ToolSelector/` - Remove and replace with WorkflowSelector
- **NEW**: `src/components/WorkflowSelector/` - UI for user-invoked workflows
- `src/core/chatInteractionMachine.ts` - Simplify (no tool parsing on frontend)
- `src/types/toolConfig.ts` - Rename/refactor to workflowConfig.ts

### Migration Notes
- **No backward compatibility** - Clean break from old system
- Existing tool configurations will need to be classified as Tools or Workflows
- Frontend tool selector UI will be replaced entirely

