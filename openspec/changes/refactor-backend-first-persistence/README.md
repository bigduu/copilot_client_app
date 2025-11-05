# Backend-First Persistence Refactor

## Overview

This refactor implements a **backend-first persistence architecture** where the backend is the single source of truth for all chat state. The backend automatically persists all messages when processing user requests through action-based APIs.

## ✅ What's Implemented

### Backend Components

1. **Dirty Flag Optimization** (`crates/context_manager/src/structs/context.rs`)
   - Added `dirty` flag to `ChatContext`
   - Auto-marks dirty when messages are added
   - Prevents redundant database writes

2. **Auto-Save Hooks** (`crates/web_service/src/services/session_manager.rs`)
   - Smart persistence that checks dirty flag
   - Only saves when context has changes
   - Clears dirty flag after successful save

3. **FSM Auto-Persistence** (`crates/web_service/src/services/chat_service.rs`)
   - Auto-saves after adding user message
   - Auto-saves after FSM generates assistant response
   - Comprehensive logging for debugging

4. **Action-Based API** (`crates/web_service/src/controllers/context_controller.rs`)
   - `POST /v1/contexts/{id}/actions/send_message` - Send message and trigger FSM
   - `POST /v1/contexts/{id}/actions/approve_tools` - Approve tool calls
   - `GET /v1/contexts/{id}/state` - Get current context state
   - Old CRUD endpoints marked with deprecation warnings

### Frontend Components

1. **Service Layer** (`src/services/BackendContextService.ts`)
   - `sendMessageAction()` - Calls backend action API
   - `approveToolsAction()` - Approves tools via action API
   - `getChatState()` - Polls for state updates

2. **Message Sending** (`src/hooks/useChatManager.ts`)
   - Updated `sendMessage()` to use action API
   - Backend handles all persistence automatically
   - Optimistic UI updates with backend reconciliation

3. **State Management** (`src/store/slices/chatSessionSlice.ts`)
   - Modified `addMessage()` to skip persistence for user messages
   - User messages go through action API
   - Backend is authoritative source

## 🔄 How It Works

```
Frontend                           Backend
   |                                  |
   |-- POST /actions/send_message --->|
   |    { "content": "hi" }           |
   |                                  |
   |                                  |-- ✅ Save user message (auto)
   |                                  |-- ✅ Run FSM
   |                                  |-- ✅ Generate assistant response
   |                                  |-- ✅ Save assistant response (auto)
   |                                  |
   |<---- Complete context ------------|
         (both messages persisted)
```

**Key Point**: Frontend just calls the action API. Backend handles everything else.

## 📚 Documentation

- **[BACKEND_PERSISTENCE_FLOW.md](./BACKEND_PERSISTENCE_FLOW.md)** - Complete technical flow with code examples
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Step-by-step migration instructions for frontend
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Overview of implementation details
- **[tasks.md](./tasks.md)** - Detailed task checklist with progress tracking

## 🧪 Testing

### Run the Test Script

```bash
cd openspec/changes/refactor-backend-first-persistence
./test_backend_persistence.sh
```

This will:

1. Create a test context
2. Send a message via action API
3. Verify both user and assistant messages are persisted
4. Test dirty flag optimization
5. Compare old CRUD vs new action API

### Manual Testing

1. **Start the backend** (with new logs enabled):

```bash
cd crates/web_service
RUST_LOG=info,web_service=debug cargo run
```

2. **Send a test message**:

```bash
# Create context
CONTEXT_ID=$(curl -s -X POST http://localhost:8080/v1/contexts \
  -H "Content-Type: application/json" \
  -d '{"model_id": "gpt-4", "mode": "chat", "system_prompt_id": null}' | jq -r '.id')

# Send message via ACTION API (new way)
curl -X POST "http://localhost:8080/v1/contexts/${CONTEXT_ID}/actions/send_message" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!"}'

# Verify both messages were saved
curl "http://localhost:8080/v1/contexts/${CONTEXT_ID}/messages" | jq
```

3. **Check logs**:

```
INFO  === send_message_action CALLED ===
INFO  User message added to branch 'main'
INFO  Auto-saving context after adding user message
DEBUG Saving dirty context ...
INFO  Context auto-saved successfully
INFO  FSM: Creating assistant response
DEBUG Saving dirty context ...
INFO  Context auto-saved successfully
```

## 🎯 Benefits

### 1. **Single Source of Truth**

- Backend database is authoritative
- No frontend/backend state drift
- Easier debugging and reasoning

### 2. **Automatic Consistency**

- All related messages saved together
- FSM state transitions are atomic
- No partial updates possible

### 3. **Optimized Performance**

- Dirty flag prevents redundant DB writes
- Batch operations possible
- Reduced I/O overhead

### 4. **Simplified Frontend**

- No manual persistence logic
- Just call action API and wait
- Backend handles complexity

## 🔧 Current State

### ✅ Completed

- Backend auto-persistence infrastructure
- Action-based API endpoints
- Frontend service layer
- Message sending migration
- FSM state transitions (Idle ↔ ProcessingUserMessage)
- Comprehensive documentation
- Test scripts
- **Both user and assistant messages auto-saved correctly**

### ⚠️ Using Mock LLM Responses

The FSM currently returns mock responses like "I'm a mock response..." instead of calling the actual LLM. This is **intentional** to:

- Test the persistence infrastructure
- Verify auto-save hooks work
- Validate message flow

**To integrate real LLM**: See [LLM_INTEGRATION_GUIDE.md](./LLM_INTEGRATION_GUIDE.md)

### 🚧 In Progress

- Streaming message handling
- Tool approval flow via action API

### 📋 TODO

- Replace mock LLM with real calls (see LLM_INTEGRATION_GUIDE.md)
- Unit tests for auto-save
- Integration tests for action endpoints
- Performance benchmarks
- Deprecate old CRUD endpoints (breaking change)

## 🚀 Next Steps

1. **Test the implementation**:

   ```bash
   ./test_backend_persistence.sh
   ```

2. **Check backend logs** to verify persistence:
   - Look for "Auto-saving context" messages
   - Verify "Saving dirty context" appears
   - Confirm "Context auto-saved successfully"

3. **Frontend testing**:
   - Send messages via UI
   - Check browser console for "Backend action completed"
   - Verify messages appear immediately (optimistic)
   - Confirm persistence via backend API

4. **Report issues**:
   - If user message not saved → Check dirty flag
   - If assistant message missing → Check FSM implementation
   - If duplicate saves → Check dirty flag logic

## 📞 Support

For questions or issues:

1. Check [BACKEND_PERSISTENCE_FLOW.md](./BACKEND_PERSISTENCE_FLOW.md) for technical details
2. Review [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for frontend changes
3. Run the test script to verify backend behavior
4. Check backend logs for persistence operations

## 📝 Files Changed

### Backend

- `crates/context_manager/src/structs/context.rs` - Dirty flag
- `crates/web_service/src/services/session_manager.rs` - Smart save
- `crates/web_service/src/services/chat_service.rs` - Auto-save hooks
- `crates/web_service/src/controllers/context_controller.rs` - Action API

### Frontend

- `src/services/BackendContextService.ts` - Action methods
- `src/hooks/useChatManager.ts` - Use action API
- `src/store/slices/chatSessionSlice.ts` - Skip manual persistence

### Documentation

- All files in `openspec/changes/refactor-backend-first-persistence/`

## 🎉 Summary

The backend now **automatically persists all context messages** when processing requests through the action API. The frontend no longer needs to manually save messages—it just calls the action endpoint and receives the complete, persisted state back.

This ensures data consistency, simplifies the architecture, and provides a solid foundation for future features.
