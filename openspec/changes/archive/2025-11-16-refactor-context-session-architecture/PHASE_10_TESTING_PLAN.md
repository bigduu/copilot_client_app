# Phase 10: Frontend SSE Migration - Testing Plan

**Date**: 2025-11-09  
**Status**: Ready for Testing  
**Implementation**: 53% Complete (Phase 1-3 Done)

---

## Overview

This document outlines the comprehensive testing plan for Phase 10 (Frontend SSE Migration). The goal is to ensure the new Signal-Pull SSE architecture works correctly before enabling it in production.

---

## Testing Phases

### Phase 4.1: Manual Testing (10 test cases)
### Phase 4.2: Integration Testing (6 test cases)
### Phase 4.3: Performance Testing (4 test cases)

---

## Phase 4.1: Manual Testing

### Prerequisites

1. **Enable feature flag**:
   ```typescript
   // In src/hooks/useChatManager.ts
   const USE_SIGNAL_PULL_SSE = true; // Change from false to true
   ```

2. **Start backend server**:
   ```bash
   cargo run --bin web_service
   ```

3. **Start frontend**:
   ```bash
   npm run tauri dev
   ```

---

### Test Case 1: Basic Message Send/Receive

**Objective**: Verify basic message flow works

**Steps**:
1. Open the application
2. Create a new chat
3. Send a simple message: "Hello, how are you?"
4. Observe the response

**Expected Results**:
- ✅ User message appears immediately (optimistic update)
- ✅ Empty assistant message appears (streaming indicator)
- ✅ Assistant message content streams in character by character
- ✅ Final message is complete and correct
- ✅ No console errors

**Pass Criteria**: All expected results met

---

### Test Case 2: SSE Connection Establishment

**Objective**: Verify SSE connection is established correctly

**Steps**:
1. Open browser DevTools → Network tab
2. Send a message
3. Look for SSE connection in Network tab

**Expected Results**:
- ✅ EventSource connection to `/api/v1/contexts/{id}/stream` is established
- ✅ Connection status is "pending" (long-lived connection)
- ✅ Events are received (visible in EventStream tab)
- ✅ Console logs show: `[SSE] Event received: content_delta`

**Pass Criteria**: SSE connection established and events received

---

### Test Case 3: Content Pulling

**Objective**: Verify content is pulled correctly from REST API

**Steps**:
1. Send a message
2. Watch console logs for content pulling

**Expected Results**:
- ✅ Console shows: `[SSE] Pulling content from sequence 0`
- ✅ Console shows: `[SSE] Content received: sequence=1, length=X`
- ✅ Sequence numbers increment correctly (0, 1, 2, ...)
- ✅ Content accumulates correctly in UI

**Pass Criteria**: Content pulled incrementally with correct sequence tracking

---

### Test Case 4: Message Completion

**Objective**: Verify message completion flow works

**Steps**:
1. Send a message
2. Wait for complete response
3. Check final state

**Expected Results**:
- ✅ Console shows: `[ChatManager] Message completed, fetching final state`
- ✅ Final messages fetched from backend
- ✅ SSE connection cleaned up
- ✅ Console shows: `[ChatManager] Final messages synced: X messages`

**Pass Criteria**: Message completes and final state is synced

---

### Test Case 5: Multiple Messages

**Objective**: Verify multiple messages work correctly

**Steps**:
1. Send message 1: "What is 2+2?"
2. Wait for response
3. Send message 2: "What is 3+3?"
4. Wait for response
5. Send message 3: "What is 4+4?"

**Expected Results**:
- ✅ All 3 messages send successfully
- ✅ All 3 responses received correctly
- ✅ Messages appear in correct order
- ✅ No sequence number conflicts
- ✅ SSE connection reused or recreated correctly

**Pass Criteria**: All messages work without interference

---

### Test Case 6: Chat Switching

**Objective**: Verify SSE cleanup when switching chats

**Steps**:
1. Create Chat A, send a message
2. While streaming, create Chat B
3. Switch to Chat B
4. Send a message in Chat B

**Expected Results**:
- ✅ Console shows: `[ChatManager] Cleaning up SSE subscription`
- ✅ Old SSE connection closed
- ✅ New SSE connection established for Chat B
- ✅ No memory leaks
- ✅ No cross-chat message contamination

**Pass Criteria**: SSE cleanup works correctly on chat switch

---

### Test Case 7: Error Handling - Network Error

**Objective**: Verify error handling for network failures

**Steps**:
1. Send a message
2. During streaming, disconnect network (or stop backend)
3. Observe behavior

**Expected Results**:
- ✅ Console shows: `[ChatManager] SSE error: ...`
- ✅ User sees error message: "Connection error. Please try again."
- ✅ SSE connection cleaned up
- ✅ UI remains responsive
- ✅ Can retry after reconnecting

**Pass Criteria**: Graceful error handling with user feedback

---

### Test Case 8: Error Handling - Backend Error

**Objective**: Verify error handling for backend errors

**Steps**:
1. Send a message that triggers backend error (e.g., invalid context ID)
2. Observe behavior

**Expected Results**:
- ✅ Console shows error details
- ✅ User sees error message
- ✅ SSE connection cleaned up
- ✅ UI remains responsive

**Pass Criteria**: Backend errors handled gracefully

---

### Test Case 9: Long Message Streaming

**Objective**: Verify long messages stream correctly

**Steps**:
1. Send: "Write a 500-word essay about AI"
2. Observe streaming behavior

**Expected Results**:
- ✅ Content streams smoothly
- ✅ No UI freezing or lag
- ✅ Sequence numbers increment correctly
- ✅ Final message is complete
- ✅ No content loss

**Pass Criteria**: Long messages stream without issues

---

### Test Case 10: Component Unmount Cleanup

**Objective**: Verify SSE cleanup on component unmount

**Steps**:
1. Send a message
2. During streaming, navigate away or close app
3. Check console logs

**Expected Results**:
- ✅ Console shows: `[ChatManager] Cleaning up SSE subscription`
- ✅ SSE connection closed
- ✅ No memory leaks
- ✅ No lingering connections

**Pass Criteria**: Cleanup works on unmount

---

## Phase 4.2: Integration Testing

### Test Case 11: Backend FSM Integration

**Objective**: Verify frontend works with backend FSM states

**Steps**:
1. Send a message
2. Monitor backend logs for FSM state transitions
3. Monitor frontend logs for state_changed events

**Expected Results**:
- ✅ Backend transitions: Idle → ProcessingUserMessage → AwaitingLLMResponse → StreamingLLMResponse → ProcessingLLMResponse → Idle
- ✅ Frontend receives state_changed events
- ✅ Frontend logs state changes

**Pass Criteria**: Frontend and backend states synchronized

---

### Test Case 12: Tool Execution Flow

**Objective**: Verify tool execution works with new architecture

**Steps**:
1. Send a message that triggers tool execution
2. Observe tool execution flow

**Expected Results**:
- ✅ Tool execution triggered by backend
- ✅ Tool results received via SSE
- ✅ Tool results displayed in UI
- ✅ Conversation continues after tool execution

**Pass Criteria**: Tool execution works end-to-end

---

### Test Case 13: Multi-turn Conversation

**Objective**: Verify multi-turn conversations work

**Steps**:
1. Send: "What is the capital of France?"
2. Wait for response
3. Send: "What is its population?"
4. Wait for response
5. Send: "Tell me about its history"

**Expected Results**:
- ✅ All messages sent successfully
- ✅ Context maintained across turns
- ✅ Responses are contextually relevant
- ✅ No sequence number issues

**Pass Criteria**: Multi-turn conversation works correctly

---

### Test Case 14: Concurrent Chats

**Objective**: Verify multiple chats can be active simultaneously

**Steps**:
1. Open Chat A, send a message
2. While Chat A is streaming, switch to Chat B
3. Send a message in Chat B
4. Switch back to Chat A

**Expected Results**:
- ✅ Both chats maintain separate SSE connections
- ✅ No message cross-contamination
- ✅ Both chats work independently
- ✅ Proper cleanup when switching

**Pass Criteria**: Concurrent chats work without interference

---

### Test Case 15: Message History Sync

**Objective**: Verify message history syncs correctly

**Steps**:
1. Send multiple messages
2. Close and reopen the app
3. Check message history

**Expected Results**:
- ✅ All messages persisted correctly
- ✅ Message order preserved
- ✅ Message content accurate
- ✅ Can continue conversation

**Pass Criteria**: Message history syncs correctly

---

### Test Case 16: Backward Compatibility

**Objective**: Verify old flow still works when flag is disabled

**Steps**:
1. Set `USE_SIGNAL_PULL_SSE = false`
2. Send messages using old flow
3. Verify everything works

**Expected Results**:
- ✅ Old flow works as before
- ✅ No regressions
- ✅ Can switch between old and new flows

**Pass Criteria**: Backward compatibility maintained

---

## Phase 4.3: Performance Testing

### Test Case 17: Streaming Latency

**Objective**: Measure streaming latency

**Steps**:
1. Send a message
2. Measure time from send to first chunk
3. Measure time from send to completion

**Expected Results**:
- ✅ First chunk arrives within 500ms
- ✅ Streaming feels responsive
- ✅ No noticeable delays

**Pass Criteria**: Latency < 500ms for first chunk

---

### Test Case 18: Memory Usage

**Objective**: Verify no memory leaks

**Steps**:
1. Open browser DevTools → Memory tab
2. Take heap snapshot
3. Send 20 messages
4. Take another heap snapshot
5. Compare memory usage

**Expected Results**:
- ✅ Memory usage stable
- ✅ No significant memory growth
- ✅ SSE connections cleaned up properly

**Pass Criteria**: Memory usage < 50MB increase after 20 messages

---

### Test Case 19: High-Frequency Messages

**Objective**: Test rapid message sending

**Steps**:
1. Send 10 messages rapidly (one after another)
2. Observe behavior

**Expected Results**:
- ✅ All messages processed
- ✅ No dropped messages
- ✅ No UI freezing
- ✅ Proper SSE connection management

**Pass Criteria**: All messages processed without issues

---

### Test Case 20: Long-Running Session

**Objective**: Test stability over time

**Steps**:
1. Keep app open for 30 minutes
2. Send messages periodically
3. Monitor for issues

**Expected Results**:
- ✅ No connection drops
- ✅ No memory leaks
- ✅ Heartbeat events keep connection alive
- ✅ App remains responsive

**Pass Criteria**: Stable operation for 30+ minutes

---

## Test Results Template

```markdown
## Test Results - [Date]

### Test Case X: [Name]
- **Status**: ✅ Pass / ❌ Fail / ⚠️ Partial
- **Tester**: [Name]
- **Notes**: [Any observations]
- **Issues Found**: [List any issues]
```

---

## Success Criteria

**Phase 10 is ready for production when**:

- ✅ All 20 test cases pass
- ✅ No critical bugs found
- ✅ Performance meets requirements
- ✅ Code coverage > 80%
- ✅ Documentation complete
- ✅ Team approval obtained

---

## Next Steps After Testing

1. **If all tests pass**:
   - Enable feature flag in production
   - Monitor for issues
   - Collect user feedback

2. **If tests fail**:
   - Document issues
   - Fix bugs
   - Re-test
   - Repeat until all tests pass

3. **After successful deployment**:
   - Remove deprecated code (Phase 11)
   - Update documentation
   - Close Phase 10 tasks

---

**Ready to start testing! 🚀**

