# Frontend SSE Migration Plan (Task 0.5.1.3.5)

**Date**: 2025-11-09  
**Status**: 📋 **Planning Phase**  
**Estimated Time**: 2-3 days  
**Priority**: High (Blocking Phase 10 Beta Release)

---

## 🎯 Migration Goal

Migrate frontend from **direct AIService streaming** to **Signal-Pull architecture** using:
- **EventSource** for SSE event notifications (metadata only)
- **REST API** for content retrieval (on-demand pull)

### Current Architecture (Old)

```
Frontend (XState) → AIService → OpenAI API → Stream chunks directly to UI
```

### Target Architecture (New)

```
Frontend (XState) → Backend Context API → SSE Events (signals) → REST API (content pull)
                                       ↓
                                  EventSource listener
                                       ↓
                              content_delta event (metadata)
                                       ↓
                          GET /contexts/{id}/messages/{msg}/content
```

---

## 📊 Current State Analysis

### Files to Modify

1. **`src/core/chatInteractionMachine.ts`** (Major changes)
   - Replace `aiStream` actor with `contextStream` actor
   - Update event types to match backend SSE events
   - Handle `content_delta`, `state_changed`, `message_completed` events

2. **`src/services/AIService.ts`** (Deprecate or repurpose)
   - Current: Direct OpenAI streaming
   - Target: Remove or keep for fallback/testing only

3. **`src/services/BackendContextService.ts`** (Major changes)
   - Current: Has `sendMessageStream` but uses old format
   - Target: Implement EventSource-based SSE listener
   - Add content pull methods: `getMessageContent(contextId, messageId, fromSequence?)`

4. **`src/hooks/useChatManager.ts`** (Moderate changes)
   - Update message handling to work with new event flow
   - Replace direct chunk accumulation with sequence-based content fetching

5. **`src/types/chat.ts`** (Minor additions)
   - Add types for new SSE events: `SignalEvent`, `ContentDeltaEvent`, etc.

---

## 🔄 New Backend SSE Event Format

### Event Types

```typescript
type SignalEvent =
  | {
      type: "state_changed";
      context_id: string;
      new_state: string;
      timestamp: string;
    }
  | {
      type: "content_delta";
      context_id: string;
      message_id: string;
      current_sequence: number;
      timestamp: string;
    }
  | {
      type: "message_completed";
      context_id: string;
      message_id: string;
      final_sequence: number;
      timestamp: string;
    }
  | {
      type: "heartbeat";
      timestamp: string;
    };
```

### Key Differences from Old Format

| Aspect | Old Format | New Format |
|--------|-----------|------------|
| **Content Delivery** | Inline in SSE events | Separate REST API call |
| **Event Payload** | Full text chunks | Metadata only (sequence numbers) |
| **Synchronization** | Push-based | Signal-Pull (hybrid) |
| **State Management** | Frontend XState only | Backend FSM + Frontend sync |

---

## 📝 Implementation Tasks

### Phase 1: Backend Service Layer (1 day)

#### Task 1.1: Update BackendContextService

**File**: `src/services/BackendContextService.ts`

**Changes**:

1. **Add EventSource-based SSE listener**
   ```typescript
   /**
    * Subscribe to context events using EventSource (SSE)
    * @param contextId - The context ID to subscribe to
    * @param onEvent - Callback for each SSE event
    */
   subscribeToContextEvents(
     contextId: string,
     onEvent: (event: SignalEvent) => void,
     onError?: (error: Error) => void
   ): () => void {
     const eventSource = new EventSource(
       `${API_BASE_URL}/contexts/${contextId}/stream`
     );

     eventSource.onmessage = (event) => {
       try {
         const data = JSON.parse(event.data);
         onEvent(data);
       } catch (error) {
         console.error("Failed to parse SSE event:", error);
         onError?.(error as Error);
       }
     };

     eventSource.onerror = (error) => {
       console.error("EventSource error:", error);
       onError?.(error as Error);
     };

     // Return cleanup function
     return () => {
       eventSource.close();
     };
   }
   ```

2. **Add content pull method**
   ```typescript
   /**
    * Get message content (full or incremental)
    * @param contextId - The context ID
    * @param messageId - The message ID
    * @param fromSequence - Optional: get content from this sequence onwards
    */
   async getMessageContent(
     contextId: string,
     messageId: string,
     fromSequence?: number
   ): Promise<{
     context_id: string;
     message_id: string;
     sequence: number;
     content: string;
   }> {
     const url = fromSequence
       ? `${API_BASE_URL}/contexts/${contextId}/messages/${messageId}/content?from_sequence=${fromSequence}`
       : `${API_BASE_URL}/contexts/${contextId}/messages/${messageId}/content`;

     const response = await fetch(url);
     if (!response.ok) {
       throw new Error(`Failed to fetch message content: ${response.status}`);
     }
     return response.json();
   }
   ```

3. **Add send message method (non-streaming)**
   ```typescript
   /**
    * Send a message to the context (triggers backend processing)
    * @param contextId - The context ID
    * @param content - The message content
    */
   async sendMessage(
     contextId: string,
     content: string
   ): Promise<void> {
     const response = await fetch(
       `${API_BASE_URL}/contexts/${contextId}/messages`,
       {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           payload: {
             type: "text",
             content,
             display: null,
           },
           client_metadata: {},
         }),
       }
     );

     if (!response.ok) {
       throw new Error(`Failed to send message: ${response.status}`);
     }
   }
   ```

#### Task 1.2: Add TypeScript Types

**File**: `src/types/chat.ts` or new `src/types/sse.ts`

```typescript
export type SignalEvent =
  | StateChangedEvent
  | ContentDeltaEvent
  | MessageCompletedEvent
  | HeartbeatEvent;

export interface StateChangedEvent {
  type: "state_changed";
  context_id: string;
  new_state: string;
  timestamp: string;
}

export interface ContentDeltaEvent {
  type: "content_delta";
  context_id: string;
  message_id: string;
  current_sequence: number;
  timestamp: string;
}

export interface MessageCompletedEvent {
  type: "message_completed";
  context_id: string;
  message_id: string;
  final_sequence: number;
  timestamp: string;
}

export interface HeartbeatEvent {
  type: "heartbeat";
  timestamp: string;
}
```

---

### Phase 2: XState Machine Update (1 day)

#### Task 2.1: Update chatInteractionMachine.ts

**File**: `src/core/chatInteractionMachine.ts`

**Changes**:

1. **Replace `aiStream` actor with `contextStream` actor**

   ```typescript
   contextStream: fromCallback<ChatMachineEvent, { contextId: string }>(
     ({ input, sendBack }) => {
       const { contextId } = input;
       let currentSequence = 0;
       let currentMessageId: string | null = null;

       // Subscribe to SSE events
       const unsubscribe = backendService.subscribeToContextEvents(
         contextId,
         async (event) => {
           switch (event.type) {
             case "content_delta":
               // Pull content from REST API
               try {
                 const content = await backendService.getMessageContent(
                   event.context_id,
                   event.message_id,
                   currentSequence
                 );
                 
                 currentSequence = content.sequence;
                 currentMessageId = event.message_id;
                 
                 sendBack({
                   type: "CHUNK_RECEIVED",
                   payload: { chunk: content.content },
                 });
               } catch (error) {
                 sendBack({
                   type: "STREAM_ERROR",
                   payload: { error: error as Error },
                 });
               }
               break;

             case "message_completed":
               sendBack({
                 type: "STREAM_COMPLETE_TEXT",
                 payload: { finalContent: "" }, // Content already accumulated
               });
               break;

             case "state_changed":
               console.log(`[ContextStream] State changed: ${event.new_state}`);
               break;

             case "heartbeat":
               // Keep connection alive
               break;
           }
         },
         (error) => {
           sendBack({
             type: "STREAM_ERROR",
             payload: { error },
           });
         }
       );

       return () => {
         unsubscribe();
       };
     }
   ),
   ```

2. **Update THINKING state to use new actor**

   ```typescript
   THINKING: {
     entry: [
       assign({ streamingContent: "", finalContent: "", error: null }),
       () => console.log("[ChatMachine] Entering THINKING state"),
     ],
     invoke: {
       id: "contextStream",
       src: "contextStream",
       input: ({ context }) => ({ 
         contextId: context.currentContextId // Need to add this to context
       }),
     },
     on: {
       CHUNK_RECEIVED: {
         actions: "forwardChunkToUI",
       },
       STREAM_COMPLETE_TEXT: {
         target: "IDLE",
         actions: "finalizeStreamingMessage",
       },
       STREAM_ERROR: {
         target: "IDLE",
         actions: assign({
           error: ({ event }) => event.payload.error,
         }),
       },
       CANCEL: {
         target: "IDLE",
       },
     },
   },
   ```

3. **Add contextId to machine context**

   ```typescript
   interface ChatMachineContext {
     messages: Message[];
     currentContextId: string | null; // NEW
     streamingContent: string;
     finalContent: string;
     toolCallRequest?: ToolCallRequest;
     parsedParameters: ParameterValue[] | null;
     error: Error | null;
   }
   ```

---

### Phase 3: Hook Integration (0.5 days)

#### Task 3.1: Update useChatManager.ts

**File**: `src/hooks/useChatManager.ts`

**Changes**:

1. **Update sendMessage to use new backend API**

   ```typescript
   const sendMessage = useCallback(
     async (content: string) => {
       const { currentChatId: chatId } = useAppStore.getState();
       if (!chatId) return;

       try {
         // Send message to backend (non-streaming)
         await backendService.sendMessage(chatId, content);

         // Trigger state machine to start listening for events
         send({
           type: "USER_SUBMITS",
           payload: {
             messages: [], // Messages are now managed by backend
           },
         });
       } catch (error) {
         console.error("[ChatManager] Failed to send message:", error);
         // Handle error
       }
     },
     [send]
   );
   ```

2. **Update forwardChunkToUI action**

   ```typescript
   forwardChunkToUI: ({ event }: { event: ChatMachineEvent }) => {
     if (event.type === "CHUNK_RECEIVED") {
       setStreamingText((prev) => prev + event.payload.chunk);
     }
   },
   ```

3. **Update finalizeStreamingMessage action**

   ```typescript
   finalizeStreamingMessage: async ({
     event,
   }: {
     event: ChatMachineEvent;
   }) => {
     const { currentChatId: chatId } = useAppStore.getState();
     if (
       event.type === "STREAM_COMPLETE_TEXT" &&
       streamingMessageId &&
       chatId
     ) {
       // Content is already accumulated in streamingText
       await updateMessageContent(
         chatId,
         streamingMessageId,
         streamingText
       );
       
       // Reset local streaming UI state
       setStreamingMessageId(null);
       setStreamingText("");
     }
   },
   ```

---

### Phase 4: Testing & Validation (0.5 days)

#### Task 4.1: Manual Testing Checklist

- [ ] Send a simple text message
- [ ] Verify SSE connection is established
- [ ] Verify `content_delta` events are received
- [ ] Verify content is pulled from REST API
- [ ] Verify streaming text appears in UI
- [ ] Verify `message_completed` event finalizes message
- [ ] Test error handling (network errors, backend errors)
- [ ] Test cancellation (abort streaming)
- [ ] Test multiple concurrent messages
- [ ] Test reconnection after connection loss

#### Task 4.2: Integration Testing

- [ ] Test with tool calls (backend agent loop)
- [ ] Test with file references
- [ ] Test with workflows
- [ ] Test with approval requests
- [ ] Test with mode switching (plan → act)
- [ ] Test with branch operations

---

## 🚨 Breaking Changes & Migration Notes

### For Developers

1. **AIService is deprecated**
   - Old: `aiService.executePrompt(messages, model, onChunk)`
   - New: `backendService.sendMessage(contextId, content)` + EventSource

2. **Message handling is now backend-driven**
   - Old: Frontend manages message accumulation
   - New: Backend manages messages, frontend pulls on-demand

3. **State machine context changes**
   - Added: `currentContextId` field
   - Removed: Direct message array management

### For Users

- **No visible changes** - UI behavior remains the same
- **Better reliability** - Backend manages state consistency
- **Better performance** - Reduced SSE payload size

---

## 📦 Rollout Strategy

### Step 1: Feature Flag (Optional)

Add a feature flag to toggle between old and new architecture:

```typescript
const USE_NEW_SSE_ARCHITECTURE = import.meta.env.VITE_USE_NEW_SSE === "true";
```

### Step 2: Parallel Implementation

Keep both old and new code paths during migration:

```typescript
if (USE_NEW_SSE_ARCHITECTURE) {
  // New EventSource-based flow
} else {
  // Old AIService flow
}
```

### Step 3: Gradual Rollout

1. **Internal testing** (1-2 days)
2. **Beta users** (3-5 days)
3. **Full rollout** (after validation)

### Step 4: Cleanup

Remove old code after successful rollout:
- Delete `AIService.ts` (or keep for fallback)
- Remove feature flag
- Update documentation

---

## 📚 Additional Resources

- **Backend API Docs**: `docs/api/CONTEXT_MANAGER_API.md`
- **Architecture Docs**: `docs/architecture/CONTEXT_SESSION_ARCHITECTURE.md`
- **Signal-Pull Spec**: `openspec/changes/refactor-context-session-architecture/specs/sync/spec.md`

---

## ✅ Success Criteria

- [ ] All manual tests pass
- [ ] All integration tests pass
- [ ] No console errors during normal operation
- [ ] Streaming performance is acceptable (< 100ms latency)
- [ ] Memory usage is stable (no leaks)
- [ ] Code coverage > 80% for new code
- [ ] Documentation is updated
- [ ] Old code is removed or deprecated

---

## 🎯 Next Steps

1. **Review this plan** with the team
2. **Create subtasks** in task tracker
3. **Assign developers** to each phase
4. **Set up testing environment**
5. **Begin Phase 1 implementation**

