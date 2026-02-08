# Message "Stuck" Issue Fix Report

## Problem Description

Users reported that messages appeared "stuck" after sending. The following abnormal behavior was observed in the logs:

### Frontend Log Anomalies
```
chatInteractionMachine.ts:235 [ChatMachine] Entering IDLE state  (repeated 3 times)
chatSessionSlice.ts:266 [ChatSlice] Skipping empty assistant message
```

### Backend Logs Normal
- Stream completed normally
- Messages saved correctly
- FSM state transitions normal

## Root Cause Analysis

After investigation, several key issues were identified:

### 1. State Machine Re-initialization
**Location**: `src/hooks/useChatManager.ts:82-113`

**Issue**: The `useMemo` dependencies included `streamingMessageId` and `updateMessageContent`, causing the state machine to be recreated whenever these values changed. This caused the state machine to enter the IDLE state multiple times.

```typescript
// ❌ Problematic code
const providedChatMachine = useMemo(() => {
  return chatMachine.provide({
    actions: { ... }
  });
}, [streamingMessageId, updateMessageContent]); // Dependencies cause frequent rebuilds
```

**Fix**: Remove dependencies so the state machine initializes only once when the component mounts. Actions access the latest state through closures internally.

```typescript
// ✅ Fixed
const providedChatMachine = useMemo(() => {
  return chatMachine.provide({
    actions: { ... }
  });
}, []); // Initialize only once when component mounts
```

### 2. onDone Called Twice in SSE Stream
**Location**: `src/services/BackendContextService.ts:266-317`

**Issue**: In the `sendMessageStream` method, the `onDone` callback could be called twice:
1. Once when `parsed.done` is parsed
2. Again when the `while` loop ends

```typescript
// ❌ Problematic code
while (true) {
  // ... process messages
  if (parsed.done) {
    onDone();  // First call
    return;
  }
}
onDone();  // Second call (if no return)
```

**Fix**: Add a `streamCompleted` flag to prevent duplicate calls.

```typescript
// ✅ Fixed
let streamCompleted = false;
while (true) {
  // ... process messages
  if (parsed.done) {
    streamCompleted = true;
    onDone();
    return;
  }
}
if (!streamCompleted) {
  onDone();
}
```

### 3. Stale Closure Causing Message State Inconsistency
**Location**: `src/hooks/useChatManager.ts:275-289`

**Issue**: The `baseMessages` used in the `onChunk` callback were captured at the start of the function and may be outdated. Each call to `setMessages` triggers a re-render, causing `baseMessages` to change, but `baseMessages` in the `onChunk` callback remains the old value.

```typescript
// ❌ Problematic code
const sendMessage = useCallback(async (content: string) => {
  // baseMessages captured here
  const messages = [...baseMessages, userMessage, assistantMessage];

  await backendService.sendMessageStream(
    chatId,
    content,
    (chunk: string) => {
      // Using stale baseMessages
      const currentMessages = [...baseMessages, userMessage, updatedAssistant];
      setMessages(chatId, currentMessages);
    }
  );
}, [baseMessages, ...]);
```

**Fix**: Get the latest message list from the store in real-time within the callback.

```typescript
// ✅ Fixed
(chunk: string) => {
  accumulatedContent += chunk;
  const updatedAssistantMessage = {
    ...assistantMessage,
    content: accumulatedContent,
  };
  // Get latest state from store to avoid stale closure
  const { chats } = useAppStore.getState();
  const currentChat = chats.find((c) => c.id === chatId);
  if (currentChat) {
    const updatedMessages = currentChat.messages.map((msg) =>
      msg.id === assistantMessageId ? updatedAssistantMessage : msg
    );
    setMessages(chatId, updatedMessages);
  }
}
```

## Impact Scope

These issues could cause the following user-visible symptoms:
1. UI not updating or updating incompletely after message sent
2. Loading indicator not disappearing
3. Duplicate or missing messages in the message list
4. Abnormal state machine states

## Testing Recommendations

After the fix, please test the following scenarios:
1. **Basic message sending**: Send a simple message and confirm the response displays normally
2. **Long response streaming**: Send a question requiring a long response and confirm smooth streaming
3. **Continuous sending**: Quickly send multiple messages in succession and confirm state synchronization
4. **Switching conversations**: Switch to another conversation during streaming and confirm state resets correctly
5. **Network interruption**: Simulate network interruption and confirm proper error handling

## Related Files

- `src/hooks/useChatManager.ts` - State machine initialization and message sending logic
- `src/services/BackendContextService.ts` - SSE stream handling
- `src/store/slices/chatSessionSlice.ts` - Message state management

## References

- Related Issue: Message stuck issue
- Fix Date: 2025-11-03
- Fixed By: AI Assistant

