# Refactor to Backend-First Persistence Architecture

## Why

The current hybrid persistence model creates unnecessary complexity and potential inconsistencies. The frontend manually orchestrates persistence by calling backend APIs after every state change, duplicating business logic and creating two sources of truth. The backend already has a robust FSM (Finite State Machine) and storage layer—it should handle ALL persistence automatically.

## What Changes

- **BREAKING**: Move all persistence logic from frontend to backend FSM
- Remove manual `addMessage()` and `updateMessageContent()` persistence calls from frontend
- Replace low-level CRUD APIs with action-based APIs (`send_message`, `approve_tools`)
- Backend FSM automatically persists state after every transition
- Frontend becomes read-only consumer of backend state via polling/SSE
- Simplify frontend to only handle UI updates and action dispatching

## Impact

### Affected Specs

- `backend-context-management` - Auto-persistence in FSM
- `frontend-ui-layer` - Remove manual persistence, add state polling

### Affected Code

- **Backend**:
  - `crates/web_service/src/controllers/context_controller.rs` - New action-based endpoints
  - `crates/web_service/src/services/chat_service.rs` - Auto-save after FSM transitions
  - `crates/web_service/src/services/session_manager.rs` - Ensure save on every mutation
- **Frontend**:
  - `src/store/slices/chatSessionSlice.ts` - Remove persistence logic, add polling
  - `src/hooks/useChatManager.ts` - Simplify to action dispatching
  - `src/services/BackendContextService.ts` - Add action-based methods

### Migration Strategy

- Backward compatible during transition
- Old CRUD endpoints remain but deprecated
- New action endpoints automatically handle persistence
- Frontend gradually migrates from manual persistence to read-only sync

## Dependencies

- Requires `migrate-frontend-to-context-manager` to be complete (currently at 50/65 tasks)

## Success Criteria

- Zero manual persistence calls in frontend code
- Backend FSM logs show automatic saves after state transitions
- Chat history persists correctly after page refresh
- Performance remains equivalent or improves (fewer roundtrips)

