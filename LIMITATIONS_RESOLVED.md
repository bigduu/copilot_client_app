# Limitations Resolved

## Summary

Both identified limitations have been successfully resolved:

1. ✅ **Cancel/Stop Fixed** - Users can now cancel running agent execution
2. ✅ **QuestionDialog Polling Fixed** - Polling no longer stops permanently

---

## Solution 1: Cancel/Stop Fixed ✅

### Problem
The `/stop` endpoint was broken because it only looked in the legacy `cancel_tokens` map, but the new runner architecture stores cancellation tokens in `agent_runners`.

### Changes Made

#### 1. Backend: Updated `/stop` handler
**File**: `crates/agent-server/src/handlers/stop.rs`

```rust
pub async fn handler(state: web::Data<AppState>, path: web::Path<String>) -> impl Responder {
    let session_id = path.into_inner();

    // Try to cancel via agent_runners (new architecture)
    let runner_cancelled = {
        let runners = state.agent_runners.read().await;
        if let Some(runner) = runners.get(&session_id) {
            if matches!(runner.status, AgentStatus::Running) {
                runner.cancel_token.cancel();
                true
            } else {
                false
            }
        } else {
            false
        }
    };

    // Also try legacy cancel_tokens for backward compatibility
    let legacy_cancelled = {
        let mut tokens = state.cancel_tokens.write().await;
        if let Some(token) = tokens.get(&session_id) {
            token.cancel();
            tokens.remove(&session_id);
            true
        } else {
            false
        }
    };

    if runner_cancelled || legacy_cancelled {
        // Update runner status to Cancelled
        let mut runners = state.agent_runners.write().await;
        if let Some(runner) = runners.get_mut(&session_id) {
            runner.status = AgentStatus::Cancelled;
        }

        HttpResponse::Ok().json(StopResponse { success: true })
    } else {
        HttpResponse::NotFound().json(StopResponse { success: false })
    }
}
```

#### 2. Backend: Emit terminal event on cancellation
**Files**: `crates/agent-server/src/handlers/execute.rs` and `stream.rs`

```rust
// Send terminal event for all error cases (including cancellation)
if let Err(ref e) = result {
    if e.to_string().contains("cancelled") {
        // Emit a specific cancellation event so SSE streams can close cleanly
        let _ = mpsc_tx.send(agent_core::AgentEvent::Error {
            message: "Agent execution cancelled by user".to_string(),
        }).await;
    } else {
        let _ = mpsc_tx.send(agent_core::AgentEvent::Error {
            message: e.to_string(),
        }).await;
    }
}
```

#### 3. Frontend: Call backend `/stop` on cancel
**File**: `src/pages/ChatPage/hooks/useChatManager/useMessageStreaming.ts`

```typescript
const cancel = useCallback(() => {
  // Abort local streaming
  abortRef.current?.abort();

  // Also tell backend to stop agent execution
  const sessionId = deps.currentChat?.config?.agentSessionId;
  if (sessionId) {
    agentClientRef.current.stopGeneration(sessionId).catch((error) => {
      console.error('[useMessageStreaming] Failed to stop generation:', error);
    });
  }
}, [deps.currentChat?.config?.agentSessionId]);
```

### How It Works Now

```
User clicks Cancel
    ↓
Frontend calls POST /stop/{sessionId}
    ↓
Backend cancels runner via cancel_token
    ↓
Agent loop detects cancellation, emits Error event
    ↓
SSE stream receives Error event, closes
    ↓
useAgentEventSubscription sets isProcessing(false)
    ↓
UI shows cancelled state
```

---

## Solution 2: QuestionDialog Polling Fixed ✅

### Problem
`emptyCountRef` was a ref (not state), so once it reached the threshold, polling stopped permanently with no way to restart.

### Changes Made

#### File: `src/components/QuestionDialog/QuestionDialog.tsx`

**Before**:
```typescript
const emptyCountRef = useRef(0);

const shouldStopPolling = emptyCountRef.current >= MAX_EMPTY_COUNT;

useEffect(() => {
  if (shouldStopPolling) {
    return; // Stops permanently, no way to restart
  }
  // ...
}, [shouldStopPolling]);
```

**After**:
```typescript
// Use state instead of ref for polling control
const [pollingEnabled, setPollingEnabled] = useState(true);
const emptyCountRef = useRef(0);

// Reset polling when session changes
useEffect(() => {
  emptyCountRef.current = 0;
  setPollingEnabled(true); // Re-enable on session change
  setIsLoading(true);
}, [sessionId]);

useEffect(() => {
  if (!pollingEnabled) {
    return; // Stop polling
  }
  // ...
}, [pollingEnabled]);

// Re-enable after response submission
const handleSubmit = async () => {
  // ...
  await agentApiClient.post(`respond/${sessionId}`, { response });
  emptyCountRef.current = 0;
  setPollingEnabled(true); // Re-enable polling
  // ...
};
```

### How It Works Now

```
Polling stops after 3 empty responses
    ↓
User submits clarification response
    ↓
setPollingEnabled(true) re-enables polling
    ↓
Polling resumes
    ↓
If agent asks another question, it will be detected
```

---

## Test Results

### Backend Tests
```
Running 30 tests
✅ All 30 tests passed
```

### Frontend Build
```
VITE v6.3.2  ready in 163 ms
✅ TypeScript compilation successful
```

### Manual Testing Required
1. **Cancel Flow**: Start a chat, then click Cancel button
   - Expected: Agent stops, UI shows cancelled state

2. **Polling Recovery**: Submit clarification response
   - Expected: Polling continues, can detect future questions

---

## Files Modified

### Backend (3 files)
1. `crates/agent-server/src/handlers/stop.rs` - Fixed cancel endpoint
2. `crates/agent-server/src/handlers/execute.rs` - Emit terminal event on cancel
3. `crates/agent-server/src/handlers/stream.rs` - Emit terminal event on cancel

### Frontend (2 files)
4. `src/pages/ChatPage/hooks/useChatManager/useMessageStreaming.ts` - Call backend /stop
5. `src/components/QuestionDialog/QuestionDialog.tsx` - Use state for polling control

---

## Summary

✅ **All Limitations Resolved**

| Issue | Status | Solution |
|-------|--------|----------|
| Cancel/Stop Broken | ✅ Fixed | Backend now checks agent_runners, emits terminal event |
| Polling Stops Permanently | ✅ Fixed | Use state instead of ref, re-enable on response |

All tests pass, frontend builds successfully, ready for manual testing.
