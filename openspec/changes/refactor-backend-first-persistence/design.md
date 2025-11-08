# Backend-First Persistence Architecture Design

## Context

The current architecture (post `migrate-frontend-to-context-manager`) has:

1. **Backend**: Context Manager with FSM, LRU cache, and file storage
2. **Frontend**: Optimistic UI updates + manual backend persistence calls
3. **Problem**: Frontend duplicates persistence orchestration logic

This creates:

- Race conditions between optimistic updates and backend state
- Two sources of truth (frontend Zustand + backend storage)
- Business logic duplication (when to save, what to save)
- Complexity in error handling and rollback

The backend's FSM is underutilized—it should own all state transitions AND their persistence.

## Goals

1. **Single Source of Truth**: Backend is authoritative for all chat state
2. **Automatic Persistence**: Backend saves state after every FSM transition
3. **Simplified Frontend**: UI reacts to backend state, dispatches actions only
4. **Performance**: Minimize roundtrips through intelligent caching and polling
5. **Reliability**: Eliminate race conditions and sync issues

## Non-Goals

- Real-time collaboration (out of scope)
- Offline-first architecture (requires service workers)
- GraphQL/subscriptions (REST + polling is sufficient for MVP)
- Migrating existing data (no schema changes)

## Decisions

### Decision 1: Action-Based API Design

**What**: Replace low-level CRUD APIs with high-level action endpoints

**Current (CRUD-style)**:

```
POST /api/contexts/{id}/messages     # Manual save
GET  /api/contexts/{id}/messages     # Manual fetch
PATCH /api/contexts/{id}/messages/{mid}  # Manual update
```

**New (Action-style)**:

```
POST /api/contexts/{id}/actions/send_message
POST /api/contexts/{id}/actions/approve_tools
GET  /api/contexts/{id}/state              # Poll for updates
```

**Why**:

- Backend owns the "what happens next" logic
- FSM handles state transitions automatically
- Frontend just says "user sent message" or "user approved tools"
- Backend responds with new state (messages, FSM status, etc.)

**Alternatives Considered**:

1. Keep CRUD, add auto-save hooks → Still requires frontend to know when to call save
2. WebSockets/SSE only → Adds complexity, polling is sufficient for chat use case
3. GraphQL subscriptions → Overkill for this scale

**Trade-offs**:

- More backend logic, less frontend flexibility
- But: simpler mental model, fewer bugs, single source of truth

### Decision 2: FSM Auto-Persistence Hook

**What**: Add automatic save after every FSM state transition

**Implementation**:

```rust
// In chat_service.rs run_fsm loop
async fn run_fsm(...) -> Result<ServiceResponse, AppError> {
    loop {
        match current_state {
            ContextState::ProcessingUserMessage => {
                // ... FSM logic ...
                context_lock.add_message_to_branch("main", user_msg);
                // Auto-save hook
                drop(context_lock);
                self.session_manager.save_context(&context.lock().await).await?;
            }
            // ... other states ...
        }
    }
}
```

**Why**:

- Persistence is no longer frontend's concern
- Every state transition is durable immediately
- Crash recovery becomes trivial (reload from last saved state)

**Alternatives**:

1. Manual save points → Easy to forget, error-prone
2. Write-through cache → Adds complexity, not needed for file-based storage
3. Batch saves → Risk of data loss, adds complexity

**Trade-offs**: More I/O, but file writes are fast; can optimize later with dirty flags

### Decision 3: Frontend Polling vs SSE

**What**: Start with polling, add SSE later if needed

**Polling Design**:

```typescript
// Poll every 1s while chat is active
const pollInterval = useRef<NodeJS.Timeout>();

useEffect(() => {
  if (currentChatId) {
    pollInterval.current = setInterval(async () => {
      const state = await backendService.getChatState(currentChatId);
      syncLocalState(state);
    }, 1000);
  }
  return () => clearInterval(pollInterval.current);
}, [currentChatId]);
```

**Why**:

- Simple to implement and debug
- Sufficient latency for chat (<1s is acceptable)
- No connection management overhead
- Can optimize to long-polling later

**When to add SSE**:

- User reports visible lag (unlikely with 1s polling)
- We add real-time collaboration features
- We need to reduce server load (though polling is cheap)

**Trade-offs**: Slightly higher latency vs SSE, but much simpler

### Decision 4: Backward Compatibility During Transition

**What**: Keep old CRUD endpoints temporarily, mark deprecated

**Migration Path**:

1. Add new action endpoints (send_message, approve_tools, get_state)
2. Mark old endpoints with `[deprecated]` in docs
3. Frontend migrates component-by-component
4. Remove old endpoints in next major version

**Why**:

- Allows gradual migration without breaking existing code
- Can test new architecture in isolation
- Easier to rollback if issues found

**Trade-offs**: Temporary code duplication, but reduces risk

### Decision 5: Optimistic UI Updates Strategy

**What**: Keep optimistic updates for perceived performance, but poll for truth

**Flow**:

```typescript
async sendMessage(chatId, content) {
  // 1. Optimistic: Show message immediately
  addMessageLocally(chatId, { role: "user", content, id: tempId });

  // 2. Action: Tell backend
  try {
    const response = await backendService.sendMessage(chatId, content);

    // 3. Reconcile: Replace temp with real data
    replaceMessage(tempId, response.messages);
  } catch (error) {
    // Rollback optimistic update
    removeMessageLocally(chatId, tempId);
    showError(error);
  }
}
```

**Why**:

- Best of both worlds: instant feedback + backend truth
- If backend response differs from optimistic, backend wins
- Handles network delays gracefully

**Trade-offs**: Slightly more complex frontend state management, but better UX

## Architecture Diagrams

### Current Flow (Hybrid)

```
Frontend                          Backend
   |                                 |
   |-- optimistic update locally     |
   |                                 |
   |-- POST /messages (manual) ----->|
   |                                 |-- add to FSM
   |                                 |-- save to storage
   |<----- 200 OK -------------------|
   |                                 |
   |-- update local state            |
```

Problem: Frontend controls orchestration, knows when to save

### New Flow (Backend-First)

```
Frontend                          Backend
   |                                 |
   |-- optimistic update locally     |
   |                                 |
   |-- POST /actions/send_message -->|
   |                                 |-- FSM processes
   |                                 |-- auto-save to storage
   |<----- 200 + full state ---------|
   |                                 |
   |-- reconcile with truth          |
   |                                 |
   |-- GET /state (poll) ----------->|
   |<----- current state ------------|
   |-- update UI                     |
```

Backend controls orchestration, frontend just reacts

## Risks / Trade-offs

### Risk 1: Increased Backend Load (Auto-Saves)

**Mitigation**:

- Use dirty flags (only save if context changed)
- Batch saves within same FSM cycle
- File I/O is fast (<10ms), not a bottleneck

**Trade-offs**: Slightly more CPU, but negligible for chat workload

### Risk 2: Polling Overhead

**Mitigation**:

- Only poll active chat
- Stop polling when window inactive
- Use exponential backoff when no changes
- Optimize to long-polling if needed

**Trade-offs**: More network requests, but backend can handle it

### Risk 3: Migration Complexity

**Mitigation**:

- Keep old endpoints during transition
- Migrate one component at a time
- Add integration tests for both paths

**Trade-offs**: Temporary code duplication

### Risk 4: Optimistic Update Conflicts

**Mitigation**:

- Always reconcile with backend response
- Use temporary IDs that get replaced
- Show loading states clearly

**Trade-offs**: Possible UI "jumps" if backend differs

## Migration Plan

### Phase 1: Backend Infrastructure (Foundation)

1. Add auto-save hook in `chat_service.rs` FSM loop
2. Create new action endpoints (`send_message`, `approve_tools`)
3. Create state polling endpoint (`GET /contexts/{id}/state`)
4. Add integration tests for new endpoints

### Phase 2: Frontend Migration (Gradual)

1. Create action-based methods in `BackendContextService`
2. Add polling hook (`useChatStateSync`)
3. Migrate message sending to use action API
4. Remove manual `addMessage` persistence calls
5. Remove manual `updateMessageContent` persistence calls
6. Update tests to use new flow

### Phase 3: Optimization

1. Add dirty flags to reduce unnecessary saves
2. Implement exponential backoff for polling
3. Add performance monitoring
4. Consider SSE if needed

### Phase 4: Cleanup

1. Mark old CRUD endpoints as deprecated
2. Remove deprecated endpoints in next major version
3. Remove backward compatibility code
4. Update documentation

## Performance Targets

- Message send latency: <500ms (P95)
- Poll latency: <100ms (P95)
- Auto-save latency: <50ms (P95)
- UI responsiveness: <16ms (60fps)

## Open Questions

1. **Should polling be per-chat or global?**
   - **Recommendation**: Per-active-chat only; stop when chat closed

2. **What's the polling interval?**
   - **Recommendation**: Start with 1s, make configurable later

3. **How to handle concurrent edits (if we add collaboration)?**
   - **Recommendation**: Out of scope; revisit when collaboration is prioritized

4. **Should we batch multiple FSM transitions before saving?**
   - **Recommendation**: No, keep it simple; optimize later with dirty flags if needed

5. **What happens if backend crashes mid-FSM?**
   - **Recommendation**: Last saved state is loaded on restart; FSM resumes from there


