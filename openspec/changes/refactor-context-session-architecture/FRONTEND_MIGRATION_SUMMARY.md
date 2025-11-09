# Frontend SSE Migration - Complete Plan Summary

**Date**: 2025-11-09  
**Status**: 📋 **Ready to Implement**  
**Estimated Time**: 2-3 days  
**Priority**: High (Blocking Phase 11 Beta Release)

---

## 🎯 Executive Summary

This document provides a complete overview of the frontend migration from **direct AIService streaming** to the new **Signal-Pull SSE architecture**. The migration is the final step before Beta Release (Phase 11).

### What's Changing?

| Aspect | Before (Old) | After (New) |
|--------|-------------|-------------|
| **Architecture** | Frontend → AIService → OpenAI | Frontend → Backend Context API → SSE + REST |
| **Streaming** | Direct chunk streaming | Signal-Pull (metadata events + content API) |
| **State Management** | Frontend XState only | Backend FSM + Frontend sync |
| **Message Storage** | Frontend only | Backend (single source of truth) |
| **Tool Execution** | Frontend-managed | Backend agent loop |

### Why This Migration?

1. **Backend-First Architecture**: All business logic in backend, frontend is thin rendering layer
2. **Testability**: Can test entire lifecycle without frontend
3. **Multi-Client Support**: Multiple clients can connect to same backend
4. **Consistency**: Backend FSM ensures state consistency
5. **Performance**: Reduced SSE payload size (metadata only)

---

## 📊 Current Status

### ✅ Backend Complete (Phase 0-9)

- ✅ Context Manager with FSM (95 unit tests passing)
- ✅ Signal-Pull SSE architecture implemented
- ✅ Message content API with sequence tracking
- ✅ Tool auto-loop and approval system
- ✅ Comprehensive documentation (976 lines)
- ✅ All 125 tests passing (110 unit + 15 new tests)

### 📋 Frontend Migration (Phase 10)

- 📋 Planning complete (this document + `FRONTEND_MIGRATION_PLAN.md`)
- ⏸️ Implementation pending (2-3 days estimated)
- ⏸️ Testing pending (0.5 days estimated)

---

## 🗺️ Migration Roadmap

### Phase 1: Backend Service Layer (1 day)

**Goal**: Update `BackendContextService` to support EventSource and content pulling

**Key Tasks**:
1. Add `subscribeToContextEvents()` - EventSource-based SSE listener
2. Add `getMessageContent()` - Pull content from REST API
3. Add `sendMessage()` - Send message without streaming
4. Add TypeScript types for SSE events

**Files**:
- `src/services/BackendContextService.ts` (major changes)
- `src/types/sse.ts` (new file)

**Success Criteria**:
- [ ] EventSource connects to backend SSE endpoint
- [ ] SSE events are parsed correctly
- [ ] Content can be pulled from REST API
- [ ] Error handling works (reconnection, timeouts)

---

### Phase 2: XState Machine Update (1 day)

**Goal**: Replace `aiStream` actor with `contextStream` actor

**Key Tasks**:
1. Create `contextStream` actor that:
   - Subscribes to SSE events
   - Handles `content_delta` events by pulling content
   - Handles `message_completed` events
   - Handles `state_changed` events
2. Update machine context to include `currentContextId`
3. Update THINKING state to use new actor
4. Deprecate AIService

**Files**:
- `src/core/chatInteractionMachine.ts` (major changes)
- `src/services/AIService.ts` (deprecation)

**Success Criteria**:
- [ ] XState machine compiles without errors
- [ ] State transitions work correctly
- [ ] Events are handled properly
- [ ] Error states are reachable

---

### Phase 3: Hook Integration (0.5 days)

**Goal**: Update `useChatManager` to work with new architecture

**Key Tasks**:
1. Update `sendMessage()` to use new backend API
2. Update `forwardChunkToUI` action
3. Update `finalizeStreamingMessage` action
4. Add context ID management

**Files**:
- `src/hooks/useChatManager.ts` (moderate changes)

**Success Criteria**:
- [ ] Messages can be sent
- [ ] Streaming text appears in UI
- [ ] Messages are finalized correctly
- [ ] No memory leaks

---

### Phase 4: Testing & Validation (0.5 days)

**Goal**: Ensure everything works end-to-end

**Key Tasks**:
1. Manual testing (10 test cases)
2. Integration testing (6 test cases)
3. Performance testing (4 test cases)

**Success Criteria**:
- [ ] All manual tests pass
- [ ] All integration tests pass
- [ ] Performance is acceptable (< 100ms latency)
- [ ] No console errors

---

## 🔄 Event Flow Diagram

The new architecture uses a **Signal-Pull** pattern:

1. **User sends message** → Frontend calls `POST /contexts/{id}/messages`
2. **Backend processes** → Context Manager FSM transitions states
3. **SSE signals** → Backend sends `content_delta` events (metadata only)
4. **Frontend pulls** → Frontend calls `GET /contexts/{id}/messages/{msg}/content`
5. **UI updates** → Frontend updates streaming text in UI
6. **Completion** → Backend sends `message_completed` event

See the Mermaid diagrams in this document for visual representation.

---

## 📝 Key Implementation Details

### EventSource Setup

```typescript
const eventSource = new EventSource(
  `${API_BASE_URL}/contexts/${contextId}/stream`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleSSEEvent(data);
};
```

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
  return response.json();
}
```

### XState Actor

```typescript
contextStream: fromCallback<ChatMachineEvent, { contextId: string }>(
  ({ input, sendBack }) => {
    const unsubscribe = backendService.subscribeToContextEvents(
      input.contextId,
      async (event) => {
        if (event.type === "content_delta") {
          const content = await backendService.getMessageContent(
            event.context_id,
            event.message_id,
            currentSequence
          );
          sendBack({ type: "CHUNK_RECEIVED", payload: { chunk: content.content } });
        }
      }
    );
    return () => unsubscribe();
  }
),
```

---

## 🚨 Breaking Changes

### For Developers

1. **AIService is deprecated**
   - Old: `aiService.executePrompt(messages, model, onChunk)`
   - New: `backendService.sendMessage(contextId, content)` + EventSource

2. **Message handling is backend-driven**
   - Old: Frontend manages message accumulation
   - New: Backend manages messages, frontend pulls on-demand

3. **XState machine context changes**
   - Added: `currentContextId: string | null`
   - Changed: Message handling flow

### For Users

- **No visible changes** - UI behavior remains the same
- **Better reliability** - Backend manages state consistency
- **Better performance** - Reduced SSE payload size

---

## 📦 Files to Modify

### Major Changes (> 50 lines)

1. **`src/services/BackendContextService.ts`**
   - Add EventSource SSE listener
   - Add content pull methods
   - Add send message method
   - Estimated: ~150 lines added

2. **`src/core/chatInteractionMachine.ts`**
   - Replace `aiStream` with `contextStream` actor
   - Update event handling
   - Add contextId to context
   - Estimated: ~100 lines changed

3. **`src/hooks/useChatManager.ts`**
   - Update message sending flow
   - Update chunk forwarding
   - Update message finalization
   - Estimated: ~50 lines changed

### Minor Changes (< 50 lines)

4. **`src/types/sse.ts`** (new file)
   - Add SSE event types
   - Estimated: ~40 lines

5. **`src/services/AIService.ts`**
   - Add deprecation warnings
   - Estimated: ~10 lines changed

---

## ✅ Testing Checklist

### Manual Testing (10 tests)

- [ ] Send simple text message
- [ ] Verify SSE connection established
- [ ] Verify `content_delta` events received
- [ ] Verify content pulled from REST API
- [ ] Verify streaming text in UI
- [ ] Verify `message_completed` finalizes message
- [ ] Test error handling
- [ ] Test cancellation
- [ ] Test concurrent messages
- [ ] Test reconnection

### Integration Testing (6 tests)

- [ ] Test with tool calls (backend agent loop)
- [ ] Test with file references
- [ ] Test with workflows
- [ ] Test with approval requests
- [ ] Test with mode switching (plan → act)
- [ ] Test with branch operations

### Performance Testing (4 tests)

- [ ] Measure SSE latency (target: < 50ms)
- [ ] Measure content pull latency (target: < 50ms)
- [ ] Test memory usage (no leaks)
- [ ] Test with long conversations (1000+ messages)

---

## 🎯 Success Criteria

- [ ] All tests pass (manual + integration + performance)
- [ ] No console errors during normal operation
- [ ] Streaming performance is acceptable (< 100ms total latency)
- [ ] Memory usage is stable (no leaks)
- [ ] Code coverage > 80% for new code
- [ ] Documentation is updated
- [ ] Old code is deprecated or removed

---

## 📚 Documentation

### Created Documents

1. **`FRONTEND_MIGRATION_PLAN.md`** (this file's companion)
   - Detailed implementation guide
   - Code examples for each phase
   - API reference

2. **`FRONTEND_MIGRATION_SUMMARY.md`** (this file)
   - Executive summary
   - Roadmap and timeline
   - Testing checklist

3. **Updated `tasks.md`**
   - Added Phase 10 with 50+ subtasks
   - Renumbered Phase 10 → Phase 11 (Beta Release)

### Existing Documentation

- **Backend API**: `docs/api/CONTEXT_MANAGER_API.md`
- **Architecture**: `docs/architecture/CONTEXT_SESSION_ARCHITECTURE.md`
- **Signal-Pull Spec**: `openspec/changes/refactor-context-session-architecture/specs/sync/spec.md`

---

## 🚀 Next Steps

1. **Review this plan** with the team ✅ (you are here)
2. **Start Phase 1** - Backend Service Layer (1 day)
3. **Start Phase 2** - XState Machine Update (1 day)
4. **Start Phase 3** - Hook Integration (0.5 days)
5. **Start Phase 4** - Testing & Validation (0.5 days)
6. **Move to Phase 11** - Beta Release & Rollout

---

## 📞 Questions?

If you have questions about this migration plan, refer to:
- **Detailed Plan**: `FRONTEND_MIGRATION_PLAN.md`
- **Backend Docs**: `docs/api/CONTEXT_MANAGER_API.md`
- **Architecture Docs**: `docs/architecture/CONTEXT_SESSION_ARCHITECTURE.md`

---

**Ready to start? Let's begin with Phase 1! 🚀**

