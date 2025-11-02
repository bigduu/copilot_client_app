# Tools to LLM Agent Mode - Refactor Proposal

## 📊 Implementation Status

**Current Progress:** 58.6% (68/116 tasks completed)  
**Last Updated:** 2025-11-02

**Quick Links:**
- 📋 [Tasks Checklist](./tasks.md) - Detailed task list with completion status
- 📈 [Status Report (English)](./STATUS.md) - Comprehensive progress report
- 📈 [进度总结 (中文)](./进度总结.md) - 中文详细进度报告

**What's Working:** ✅ Backend workflows, system prompt enhancement, frontend workflow UI  
**What's Next:** 🚧 Agent loop integration, testing, deployment

---

## Summary

This proposal transforms the tool system from **user-invoked commands** to **LLM-driven autonomous tool usage** with agent loops, while introducing a separate **Workflow system** for explicit user actions.

### Key Changes

1. **Tools → LLM-Driven (Agent Mode)**
   - Tools are hidden from frontend
   - Defined in system prompt with strict JSON calling format
   - LLM outputs: `{"tool": "name", "parameters": {...}, "terminate": true/false}`
   - Backend orchestrates agent loops when `terminate: false`

2. **NEW: Workflow System**
   - User-invoked actions visible in frontend UI
   - Replaces current tool selector
   - Supports command-based (`/create_project`) and UI-based invocation
   - Categories organize workflows in UI

3. **System Prompt Enhancement → Backend (with API Path Distinction)**
   - **Passthrough mode** (`/v1/chat/completions`): Original prompt preserved for external clients (Cline, etc.)
   - **Context mode** (`/context/*`): Enhanced prompt with tools for our frontend
   - New endpoint: `GET /v1/system-prompts/{id}/enhanced`
   - Maintains OpenAI API compatibility
   - Frontend no longer needs tool knowledge

4. **Agent Loops**
   - LLM can chain multiple tool calls autonomously
   - Approval gates maintained for security
   - Max iterations (10) and timeout (5 min) enforced
   - Transparent to frontend (sees final result)

### Breaking Changes

- ❌ No backward compatibility
- ❌ `/tools/available` endpoint removed
- ❌ Frontend tool selector removed
- ❌ `SystemPromptEnhancer.ts` removed from frontend

## File Structure

```
openspec/changes/refactor-tools-to-llm-agent-mode/
├── proposal.md              # Why and what changes
├── design.md                # Technical decisions and architecture
├── tasks.md                 # 115 implementation tasks
├── README.md                # This file
└── specs/
    ├── tool-system/
    │   └── spec.md          # LLM-driven tool invocation with JSON format
    ├── workflow-system/
    │   └── spec.md          # User-invoked actions with parameter extraction
    ├── system-prompt-enhancement/
    │   └── spec.md          # Backend-driven prompt augmentation
    └── frontend-workflow-ui/
        └── spec.md          # Workflow selector and execution UI
```

## Validation Status

✅ **Valid** - Passed `openspec validate --strict`

## Next Steps

1. **Review this proposal** - Ensure it matches your vision
2. **Discuss any clarifications** - Open questions in design.md
3. **Get approval** - Required before implementation starts
4. **Start implementation** - Follow tasks.md sequentially (115 tasks organized in 8 phases)

## Quick Reference

### Tool Call Format (for System Prompt)

```json
{
  "tool": "read_file",
  "parameters": {
    "path": "/path/to/file"
  },
  "terminate": false
}
```

- `terminate: false` → Continue agent loop (send result back to LLM)
- `terminate: true` → Stop loop, return to user

### Architecture Overview

```
User Message
    ↓
Backend (Agent Loop)
    ↓
LLM (with tools in system prompt)
    ↓
JSON Tool Call {"terminate": false}
    ↓
Execute Tool → Back to LLM
    ↓
...repeat until terminate: true...
    ↓
Final Response to User
```

### Workflow vs Tool

| Aspect | Tool (LLM-invoked) | Workflow (User-invoked) |
|--------|-------------------|------------------------|
| **Visibility** | Hidden in prompt | Visible in UI selector |
| **Invoked by** | LLM autonomously | User explicitly |
| **Example** | `read_file`, `search` | `/create_project`, button click |

### API Path Distinction (Critical)

The system uses **different prompt strategies** based on API path:

| API Path | Client | Prompt Mode | Agent Loop | Use Case |
|----------|--------|-------------|------------|----------|
| `/v1/chat/completions` | External (Cline, Continue) | **Base (Original)** | ❌ Disabled | Standard OpenAI compatibility |
| `/v1/models` | External | **Base (Original)** | ❌ Disabled | Model listing |
| `/context/*` | Our Frontend | **Enhanced (Tools injected)** | ✅ Enabled | Full agent capabilities |

**Why this matters**:
- External clients like Cline expect standard OpenAI API behavior
- Our system needs tools and agent loops for autonomous operation
- Maintains compatibility while enabling advanced features for our frontend

## Implementation Estimate

- **Backend**: ~3-4 weeks (agent loop, workflow system, prompt enhancement)
- **Frontend**: ~2-3 weeks (workflow UI, simplified state machine)
- **Testing**: ~1 week (unit, integration, E2E)
- **Total**: ~6-8 weeks for complete implementation

## Questions or Concerns?

Review `design.md` section "Open Questions" for items that need discussion before implementation begins.

