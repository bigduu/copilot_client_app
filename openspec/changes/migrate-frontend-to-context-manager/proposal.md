# migrate-frontend-to-context-manager

**Status**: ✅ Implemented + Critical Fixes Applied  
**Created**: 2025-11-01  
**Implemented**: 2025-11-01  
**Critical Fixes Applied**: 2025-11-01

> **⚠️ IMPORTANT**: Critical runtime issues were discovered during initial testing and have been resolved. See `CRITICAL_FIXES_NOV1.md` for complete details on the polling spam fix, migration disabling, and backend 404 resolution.

---

## Why

The frontend currently manages chat context logic including message history, state machines, tool calls, and system prompts. This creates duplication with the backend's Context Manager, which provides a more robust, performant architecture with branch support, proper FSM management, and unified storage. Moving context management to the backend will simplify the frontend to focus on UI concerns, eliminate state synchronization issues, enable multi-branch conversations, and provide a single source of truth for all chat data.

## What Changes

**BREAKING**: This migration fundamentally changes how chat context is managed, replacing frontend-local storage with backend-managed contexts.

### Backend Changes

- Extend Context Manager to support system prompt CRUD operations
- Add storage provider support for system prompts in branches
- Extend ChatConfig to include system prompt ID mapping
- Add REST API endpoints for chat context CRUD (create, read, update, delete)
- Add REST API endpoints for system prompt management
- Extend tool call structures to include display metadata (display_preference, UI hints)
- Implement adapter layer to convert between Context Manager structures and frontend-friendly DTOs

### Frontend Changes

- Remove LocalStorage-based chat state management (chatSessionSlice, StateManager)
- Replace with API client that interacts with backend Context Manager
- Migrate system prompt management from LocalStorage to backend API
- Update message rendering to handle new tool call metadata fields
- Simplify state management by removing local FSM in favor of backend state
- Update StorageService to only handle UI preferences (themes, layout) rather than chat data
- Add migration utility to convert existing LocalStorage chat data to backend format
- Update all components that directly manipulate chat state to use API calls instead

### Data Migration

- ~~Provide migration script to convert existing LocalStorage chats to backend contexts~~ **DISABLED per user request**
- ~~Map ChatItem structure to ChatContext structure~~ **DISABLED per user request**
- ~~Handle system prompt references across the migration~~ **DISABLED per user request**
- ~~Preserve message history and tool call data~~ **DISABLED per user request**

**Note**: Migration was disabled at user's request to start fresh without historical data.

## Impact

- **Affected specs**: New capabilities for `backend-context-management`, `frontend-ui-layer`, `data-migration`
- **Affected code**:
  - `crates/context_manager/` - Extend for system prompts and CRUD APIs
  - `crates/web_service/` - Add context management endpoints
  - `src/store/slices/` - Remove chatSessionSlice, simplify state
  - `src/services/` - New BackendContextService, remove StorageService chat management
  - `src/components/` - Update to use API-based state
  - `src/core/` - Remove local FSM, use backend state
  - `src/types/chat.ts` - Add adapter types for backend compatibility
- **Breaking Changes**: All existing LocalStorage chat data will need migration (migration currently disabled)

## 📚 Additional Resources

- `design.md` - Detailed architecture decisions
- `tasks.md` - Implementation checklist (50/65 complete - 77%)
- `specs/` - Detailed specifications for each component
- `FINAL_IMPLEMENTATION_SUMMARY.md` - Complete implementation summary
- `CRITICAL_FIXES_NOV1.md` - **Critical runtime fixes (must read)**
