# Frontend Migration Quick Reference Card

**Quick lookup for developers implementing the frontend SSE migration**

---

## 🔗 Backend API Endpoints

### Send Message (Non-Streaming)
```
POST /api/v1/contexts/{context_id}/messages
Content-Type: application/json

{
  "payload": {
    "type": "text",
    "content": "Hello, world!",
    "display": null
  },
  "client_metadata": {}
}

Response: 200 OK
```

### Subscribe to SSE Events
```
GET /api/v1/contexts/{context_id}/stream

Response: text/event-stream
```

### Get Message Content (Pull)
```
GET /api/v1/contexts/{context_id}/messages/{message_id}/content
GET /api/v1/contexts/{context_id}/messages/{message_id}/content?from_sequence=5

Response: application/json
{
  "context_id": "uuid",
  "message_id": "uuid",
  "sequence": 7,
  "content": "accumulated text"
}
```

---

## 📡 SSE Event Types

### 1. state_changed
```json
{
  "type": "state_changed",
  "context_id": "uuid",
  "new_state": "streaming_l_l_m_response",
  "timestamp": "2025-11-09T12:00:00Z"
}
```

**When**: Context FSM state changes  
**Action**: Update UI state indicator (optional)

---

### 2. content_delta
```json
{
  "type": "content_delta",
  "context_id": "uuid",
  "message_id": "uuid",
  "current_sequence": 7,
  "timestamp": "2025-11-09T12:00:01Z"
}
```

**When**: New content chunks available  
**Action**: Call `GET /content?from_sequence=N` to pull new content

---

### 3. message_completed
```json
{
  "type": "message_completed",
  "context_id": "uuid",
  "message_id": "uuid",
  "final_sequence": 19,
  "timestamp": "2025-11-09T12:00:05Z"
}
```

**When**: Message streaming/processing complete  
**Action**: Finalize message in UI, stop pulling content

---

### 4. heartbeat
```json
{
  "type": "heartbeat",
  "timestamp": "2025-11-09T12:00:00Z"
}
```

**When**: Every 15 seconds (keep-alive)  
**Action**: Ignore (connection is alive)

---

## 🔄 Event Handling Flow

```
1. User sends message
   ↓
2. POST /messages (non-streaming)
   ↓
3. Subscribe to SSE (if not already)
   ↓
4. Receive content_delta event
   ↓
5. Pull content: GET /content?from_sequence=N
   ↓
6. Update UI with new content
   ↓
7. Repeat steps 4-6 until message_completed
   ↓
8. Finalize message in UI
```

---

## 💻 Code Snippets

### EventSource Setup

```typescript
const eventSource = new EventSource(
  `${API_BASE_URL}/contexts/${contextId}/stream`
);

eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    handleSSEEvent(data);
  } catch (error) {
    console.error("Failed to parse SSE event:", error);
  }
};

eventSource.onerror = (error) => {
  console.error("EventSource error:", error);
  // Implement reconnection logic
};

// Cleanup
return () => {
  eventSource.close();
};
```

---

### Content Pulling

```typescript
async function getMessageContent(
  contextId: string,
  messageId: string,
  fromSequence?: number
): Promise<{ sequence: number; content: string }> {
  const url = fromSequence
    ? `${API_BASE_URL}/contexts/${contextId}/messages/${messageId}/content?from_sequence=${fromSequence}`
    : `${API_BASE_URL}/contexts/${contextId}/messages/${messageId}/content`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch content: ${response.status}`);
  }
  return response.json();
}
```

---

### XState Actor (contextStream)

```typescript
contextStream: fromCallback<ChatMachineEvent, { contextId: string }>(
  ({ input, sendBack }) => {
    const { contextId } = input;
    let currentSequence = 0;
    let currentMessageId: string | null = null;

    const unsubscribe = backendService.subscribeToContextEvents(
      contextId,
      async (event) => {
        switch (event.type) {
          case "content_delta":
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
              payload: { finalContent: "" },
            });
            break;

          case "state_changed":
            console.log(`State: ${event.new_state}`);
            break;

          case "heartbeat":
            // Keep-alive
            break;
        }
      },
      (error) => {
        sendBack({ type: "STREAM_ERROR", payload: { error } });
      }
    );

    return () => {
      unsubscribe();
    };
  }
),
```

---

### Send Message

```typescript
async function sendMessage(contextId: string, content: string): Promise<void> {
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

---

## 🎯 TypeScript Types

```typescript
// SSE Event Types
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

// Content Response
export interface MessageContentResponse {
  context_id: string;
  message_id: string;
  sequence: number;
  content: string;
}
```

---

## 🐛 Common Issues & Solutions

### Issue 1: EventSource not connecting

**Symptom**: No SSE events received  
**Solution**: Check CORS settings, verify endpoint URL, check network tab

```typescript
// Debug EventSource
eventSource.addEventListener("open", () => {
  console.log("✅ EventSource connected");
});

eventSource.addEventListener("error", (e) => {
  console.error("❌ EventSource error:", e);
  console.log("ReadyState:", eventSource.readyState);
  // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
});
```

---

### Issue 2: Content not updating

**Symptom**: UI shows old content  
**Solution**: Verify sequence tracking, check content pull logic

```typescript
// Debug content pulling
console.log(`Pulling content from sequence ${currentSequence}`);
const content = await getMessageContent(contextId, messageId, currentSequence);
console.log(`Received sequence ${content.sequence}, content: ${content.content}`);
```

---

### Issue 3: Memory leak

**Symptom**: Memory usage grows over time  
**Solution**: Ensure EventSource is closed on cleanup

```typescript
// In XState actor or useEffect
return () => {
  console.log("Cleaning up EventSource");
  eventSource.close();
};
```

---

### Issue 4: Duplicate events

**Symptom**: Same content appears multiple times  
**Solution**: Track sequence numbers, deduplicate events

```typescript
let lastProcessedSequence = 0;

if (event.current_sequence <= lastProcessedSequence) {
  console.log("Skipping duplicate event");
  return;
}

lastProcessedSequence = event.current_sequence;
```

---

## 📊 State Machine States

### Context States (Backend FSM)

- `idle` - Ready for new message
- `processing_user_message` - Processing user input
- `awaiting_l_l_m_response` - Waiting for LLM
- `streaming_l_l_m_response` - Receiving LLM chunks
- `processing_l_l_m_response` - Processing LLM output
- `awaiting_tool_approval` - Waiting for user approval
- `executing_tool` - Running tool
- `processing_tool_result` - Processing tool output

### Frontend XState States

- `IDLE` - Ready for user input
- `PREPARING_PROMPT` - Preparing message
- `THINKING` - Streaming response (uses contextStream actor)
- `ROUTING_TOOL_CALL` - Handling tool call
- `AWAITING_APPROVAL` - Waiting for approval
- `EXECUTING_TOOL` - Executing tool

---

## 🔍 Debugging Tips

### Enable Verbose Logging

```typescript
// In BackendContextService
console.log("[SSE] Event received:", event);
console.log("[SSE] Pulling content from sequence:", fromSequence);
console.log("[SSE] Content received:", content);

// In XState machine
console.log("[XState] State transition:", state.value);
console.log("[XState] Event:", event.type);
console.log("[XState] Context:", context);
```

### Monitor Network Traffic

1. Open DevTools → Network tab
2. Filter by "EventStream" or "SSE"
3. Check SSE connection status
4. Monitor REST API calls to `/content`

### Check Backend Logs

```bash
# Watch backend logs
tail -f logs/web_service.log

# Filter for SSE events
tail -f logs/web_service.log | grep "SSE"
```

---

## 📚 Related Documentation

- **Detailed Plan**: `FRONTEND_MIGRATION_PLAN.md`
- **Summary**: `FRONTEND_MIGRATION_SUMMARY.md`
- **Backend API**: `docs/api/CONTEXT_MANAGER_API.md`
- **Architecture**: `docs/architecture/CONTEXT_SESSION_ARCHITECTURE.md`
- **Tasks**: `tasks.md` (Phase 10)

---

**Keep this card handy during implementation! 🚀**

