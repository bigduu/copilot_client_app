# Frontend Migration Guide: Backend-First Persistence

## Overview

This guide explains how to complete the migration from manual frontend persistence to the backend-first architecture where the backend FSM owns all persistence.

## ✅ Completed Infrastructure

### Backend (Complete)

- ✅ Auto-save hooks in FSM after every state transition
- ✅ Dirty flag optimization in `ChatContext`
- ✅ Action-based API endpoints:
  - `POST /api/contexts/{id}/actions/send_message`
  - `POST /api/contexts/{id}/actions/approve_tools`
  - `GET /api/contexts/{id}/state`

### Frontend Service Layer (Complete)

- ✅ `BackendContextService.sendMessageAction()`
- ✅ `BackendContextService.approveToolsAction()`
- ✅ `BackendContextService.getChatState()`
- ✅ `useChatStateSync` hook for polling

## 🔄 Migration Steps Remaining

### 1. Integrate Polling Hook

Add the `useChatStateSync` hook to your main chat component:

```typescript
import { useChatStateSync } from "../hooks/useChatStateSync";

function ChatComponent() {
  const currentChatId = useAppStore((state) => state.currentChatId);
  const updateChat = useAppStore((state) => state.updateChat);

  // Start polling for backend state
  useChatStateSync({
    chatId: currentChatId,
    enabled: !!currentChatId,
    onStateUpdate: (actionResponse) => {
      // Reconcile backend state with local state
      const { context, status } = actionResponse;

      // Update local chat with backend messages
      if (currentChatId) {
        // TODO: Convert backend DTO to local Message format
        // TODO: Merge with local optimistic updates
        console.log("Backend state update:", context, status);
      }
    },
    onError: (error) => {
      console.error("Polling error:", error);
    },
  });

  // ... rest of component
}
```

### 2. Migrate Message Sending

Update `useChatManager.sendMessage()` to use the action API:

**Current (Hybrid):**

```typescript
// In sendMessage():
await addMessage(chatId, userMessage); // Manual persistence
send({ type: "USER_SUBMITS", payload: { ... } }); // Local state machine
```

**Target (Backend-First):**

```typescript
// Option A: Direct action API call
const response = await backendContextService.sendMessageAction(chatId, content);
// Backend FSM has processed and auto-saved
// Update local state with response.context

// Option B: Keep local state machine but remove manual save
// Remove: await addMessage(chatId, userMessage)
// Keep: Local optimistic update
// Add: Poll for backend truth via useChatStateSync
```

### 3. Remove Manual Persistence Calls

The following calls are marked with `TODO [REFACTOR-BACKEND-FIRST]` and should be removed:

**In `chatSessionSlice.ts`:**

```typescript
// addMessage() - Lines 230-241
// TODO: Remove the entire backend save block (lines 243-280)
// Keep only: get().updateChat(chatId, { messages: [...chat.messages, message] });

// updateMessageContent() - Lines 321-332
// TODO: Remove the entire backend save block (lines 335-356)
// Keep only: get().updateChat(chatId, { messages: updatedMessages });
```

**After removal:**

```typescript
addMessage: async (chatId, message) => {
  const chat = get().chats.find((c) => c.id === chatId);
  if (chat) {
    // Optimistic update only - backend FSM handles persistence
    get().updateChat(chatId, { messages: [...chat.messages, message] });
  }
},

updateMessageContent: async (chatId, messageId, content) => {
  const chat = get().chats.find((c) => c.id === chatId);
  if (chat) {
    // Optimistic update only - backend FSM handles persistence
    const updatedMessages = chat.messages.map((msg) =>
      msg.id === messageId &&
      (msg.role === "user" || (msg.role === "assistant" && msg.type === "text"))
        ? { ...msg, content }
        : msg
    );
    get().updateChat(chatId, { messages: updatedMessages });
  }
},
```

### 4. Implement State Reconciliation

Create a reconciliation function to merge backend state with local optimistic updates:

```typescript
function reconcileMessages(
  localMessages: Message[],
  backendMessages: MessageDTO[],
): Message[] {
  // Strategy 1: Backend wins (simple)
  // Convert backend DTOs to local Message format and replace

  // Strategy 2: Merge with conflict resolution
  // - Keep messages with temporary IDs (optimistic)
  // - Replace with backend when IDs match
  // - Handle message ordering

  // Example (Backend wins):
  return backendMessages.map((dto) => convertDTOToMessage(dto));
}
```

### 5. Update Tool Approval Flow

Replace manual tool approval with action API:

**Current:**

```typescript
await approveTools(contextId, { tool_call_ids: [...] });
// Manually saves to backend
```

**Target:**

```typescript
const response = await backendContextService.approveToolsAction(
  contextId,
  toolCallIds,
);
// Backend FSM continues processing and auto-saves
// Update local state with response.context
```

## 🎯 Testing Checklist

After migration, verify:

- [ ] New messages persist after page refresh
- [ ] No duplicate persistence calls in network tab
- [ ] Optimistic updates show immediately
- [ ] Backend state reconciles correctly
- [ ] Polling stops when chat is closed
- [ ] Polling pauses when window is inactive
- [ ] Tool calls work end-to-end
- [ ] Streaming messages finalize correctly
- [ ] No race conditions between optimistic updates and polling

## 🔍 Debugging

### Check Auto-Save Logs

Backend logs should show:

```
DEBUG FSM: ProcessingUserMessage -> Calling LLM
DEBUG Saving dirty context <id>
```

### Check Polling Behavior

Frontend console should show:

```
[ChatStateSync] State changed, resetting interval
[ChatStateSync] No changes, backing off to 1500ms
```

### Verify No Manual Saves

Network tab should NOT show:

```
POST /api/contexts/{id}/messages  # Old CRUD endpoint
```

Network tab SHOULD show:

```
POST /api/contexts/{id}/actions/send_message  # New action endpoint
GET  /api/contexts/{id}/state                 # Polling endpoint
```

## 📚 Additional Resources

- **OpenSpec Proposal:** `openspec/changes/refactor-backend-first-persistence/proposal.md`
- **Design Document:** `openspec/changes/refactor-backend-first-persistence/design.md`
- **Backend Code:** `crates/web_service/src/services/chat_service.rs`
- **Frontend Service:** `src/services/BackendContextService.ts`
- **Polling Hook:** `src/hooks/useChatStateSync.ts`

## ⚠️ Breaking Changes

- **Old CRUD endpoints will be deprecated** (not removed yet for backward compatibility)
- **Manual persistence calls must be removed** to prevent double-saves
- **Frontend must poll or use SSE** for state updates

## 🚀 Future Enhancements

After core migration is complete, consider:

1. **Server-Sent Events (SSE)** instead of polling for lower latency
2. **WebSocket support** for real-time collaboration
3. **Optimistic update conflict resolution** for better UX
4. **Request deduplication** to handle rapid user actions
5. **Offline queue** for actions when backend is unavailable
