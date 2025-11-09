# Implementation Guide: Backend-First Persistence

## Quick Start

```bash
# View the proposal
openspec show refactor-backend-first-persistence

# Validate the change
openspec validate refactor-backend-first-persistence --strict

# Track implementation progress
# Update tasks.md as you complete tasks, then run:
openspec list
```

## Architecture Overview

### Current (Hybrid) Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Zustand)                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. User sends message                                   │ │
│ │ 2. Update local state (optimistic)                      │ │
│ │ 3. await backendService.addMessage() ← MANUAL!          │ │
│ │ 4. await backendService.updateMessageContent() ← MANUAL!│ │
│ │ 5. Handle errors, rollback if needed                    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP POST /messages
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend (Context Manager)                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. Receive message                                      │ │
│ │ 2. Add to context                                       │ │
│ │ 3. Save to storage (because frontend asked)            │ │
│ │ 4. Return success                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ❌ Problem: Frontend controls orchestration                │
│ ❌ Problem: Two sources of truth                           │
│ ❌ Problem: Manual sync can fail or get out of sync        │
└─────────────────────────────────────────────────────────────┘
```

### New (Backend-First) Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Zustand - Read-Only Cache)                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. User sends message                                   │ │
│ │ 2. Update local state (optimistic)                      │ │
│ │ 3. POST /actions/send_message ← Just dispatch action!   │ │
│ │ 4. Reconcile with response                              │ │
│ │                                                          │ │
│ │ Background Polling:                                     │ │
│ │ - GET /state every 1s                                   │ │
│ │ - Sync local state with backend truth                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP POST /actions/send_message
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend (Context Manager - Single Source of Truth)         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ FSM Loop:                                               │ │
│ │ 1. Receive action (send_message)                        │ │
│ │ 2. Add user message to context                          │ │
│ │ 3. AUTO-SAVE context ← Automatic!                       │ │
│ │ 4. Transition to ProcessingUserMessage                  │ │
│ │ 5. Call LLM, add assistant message                      │ │
│ │ 6. AUTO-SAVE context ← Automatic!                       │ │
│ │ 7. Return full state to frontend                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ✅ Backend controls all orchestration                      │
│ ✅ Single source of truth (storage)                        │
│ ✅ Automatic persistence, no manual sync needed            │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Order

### Phase 1: Backend Foundation (Week 1)

#### Step 1.1: Add Auto-Save Hook

**File**: `crates/web_service/src/services/chat_service.rs`

```rust
async fn run_fsm(...) -> Result<ServiceResponse, AppError> {
    loop {
        match current_state {
            ContextState::ProcessingUserMessage => {
                let mut context_lock = context.lock().await;
                // ... add message logic ...
                context_lock.mark_dirty(); // New: mark for save
                drop(context_lock);

                // Auto-save hook (new!)
                self.session_manager.save_context(&context.lock().await).await?;
                println!("✅ Auto-saved context after ProcessingUserMessage");
            }
            // ... repeat for other states ...
        }
    }
}
```

#### Step 1.2: Add Action Endpoints

**File**: `crates/web_service/src/controllers/context_controller.rs`

```rust
#[post("/contexts/{id}/actions/send_message")]
pub async fn send_message_action(
    path: web::Path<Uuid>,
    req: web::Json<SendMessageActionRequest>,
    session_manager: web::Data<Arc<ChatSessionManager<FileStorageProvider>>>,
) -> Result<HttpResponse, AppError> {
    let context_id = path.into_inner();

    // Load context
    let context = session_manager.load_context(context_id).await?
        .ok_or_else(|| AppError::NotFound("Context not found".to_string()))?;

    // Add user message
    {
        let mut context_lock = context.lock().await;
        context_lock.add_message_to_branch("main", InternalMessage {
            role: Role::User,
            content: vec![ContentPart::Text { text: req.content.clone() }],
            ..Default::default()
        });
    }

    // FSM processes and auto-saves
    let mut chat_service = ChatService::new(
        session_manager.get_ref().clone(),
        context_id,
        // ... other deps ...
    );
    let response = chat_service.process_message(req.content.clone()).await?;

    // Return full state
    Ok(HttpResponse::Ok().json(response))
}
```

#### Step 1.3: Add State Polling Endpoint

```rust
#[get("/contexts/{id}/state")]
pub async fn get_context_state(
    path: web::Path<Uuid>,
    session_manager: web::Data<Arc<ChatSessionManager<FileStorageProvider>>>,
) -> Result<HttpResponse, AppError> {
    let context_id = path.into_inner();
    let context = session_manager.load_context(context_id).await?
        .ok_or_else(|| AppError::NotFound("Context not found".to_string()))?;

    let context_lock = context.lock().await;
    let state_dto = ContextStateDTO::from(&*context_lock);

    Ok(HttpResponse::Ok().json(state_dto))
}
```

### Phase 2: Frontend Migration (Week 2)

#### Step 2.1: Add Action Methods to Service

**File**: `src/services/BackendContextService.ts`

```typescript
export class BackendContextService {
  // New: Action-based methods
  async sendMessageAction(
    contextId: string,
    content: string,
  ): Promise<ContextStateResponse> {
    const response = await fetch(
      `${this.baseUrl}/contexts/${contextId}/actions/send_message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    if (!response.ok)
      throw new Error(`Failed to send message: ${response.statusText}`);
    return response.json();
  }

  async getChatState(contextId: string): Promise<ContextStateResponse> {
    const response = await fetch(`${this.baseUrl}/contexts/${contextId}/state`);
    if (!response.ok)
      throw new Error(`Failed to get state: ${response.statusText}`);
    return response.json();
  }
}
```

#### Step 2.2: Add Polling Hook

**File**: `src/hooks/useChatStateSync.ts`

```typescript
export function useChatStateSync(chatId: string | null) {
  const syncState = useChatStore((state) => state.syncFromBackend);

  useEffect(() => {
    if (!chatId) return;

    const pollInterval = setInterval(async () => {
      try {
        const backendService = new BackendContextService();
        const state = await backendService.getChatState(chatId);
        syncState(chatId, state); // Merge backend state into Zustand
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 1000); // Poll every 1s

    return () => clearInterval(pollInterval);
  }, [chatId]);
}
```

#### Step 2.3: Migrate Message Sending

**File**: `src/hooks/useChatManager.ts`

```typescript
// OLD (manual persistence)
const sendMessage = useCallback(
  async (chatId: string, content: string) => {
    const message: Message = {
      /* ... */
    };
    await addMessage(chatId, message); // ❌ This calls backend persistence manually!
  },
  [addMessage],
);

// NEW (action-based)
const sendMessage = useCallback(async (chatId: string, content: string) => {
  // 1. Optimistic update
  const tempMessage: Message = {
    id: `temp-${Date.now()}`,
    role: "user",
    content,
  };
  addMessageLocally(chatId, tempMessage);

  // 2. Dispatch action (backend handles persistence)
  try {
    const backendService = new BackendContextService();
    const response = await backendService.sendMessageAction(chatId, content);

    // 3. Reconcile with backend response
    reconcileMessages(chatId, response.messages);
  } catch (error) {
    // Rollback optimistic update
    removeMessageLocally(chatId, tempMessage.id);
    throw error;
  }
}, []);
```

#### Step 2.4: Remove Manual Persistence

**File**: `src/store/slices/chatSessionSlice.ts`

```typescript
// OLD (manual persistence)
addMessage: async (chatId, message) => {
  const chat = get().chats.find((c) => c.id === chatId);
  if (chat) {
    get().updateChat(chatId, { messages: [...chat.messages, message] });

    // ❌ REMOVE THIS - backend handles persistence now
    // try {
    //   const backendService = new BackendContextService();
    //   await backendService.addMessage(chatId, { role: message.role, content: contentText });
    // } catch (error) { ... }
  }
},

// NEW (local-only, polling syncs)
addMessageLocally: (chatId, message) => {
  const chat = get().chats.find((c) => c.id === chatId);
  if (chat) {
    get().updateChat(chatId, { messages: [...chat.messages, message] });
    // No backend call! Polling will sync any differences.
  }
},
```

## Testing Strategy

### Backend Tests

```bash
# Test auto-save functionality
cargo test test_fsm_auto_save

# Test action endpoints
cargo test test_send_message_action
cargo test test_approve_tools_action
cargo test test_get_state_endpoint
```

### Frontend Tests

```typescript
// Test optimistic updates + reconciliation
it("should reconcile optimistic message with backend response", async () => {
  const { sendMessage } = useChatManager();
  await sendMessage("chat-1", "Hello");

  // Should show optimistic message immediately
  expect(screen.getByText("Hello")).toBeInTheDocument();

  // After backend responds, should replace with real ID
  await waitFor(() => {
    const message = getMessageById("chat-1", "msg-123"); // backend ID
    expect(message.content).toBe("Hello");
  });
});
```

### Integration Tests

```bash
# End-to-end: send message and verify persistence
npm run test:e2e -- send-message-persistence

# End-to-end: page refresh and verify state restored
npm run test:e2e -- refresh-persistence
```

## Migration Checklist

### Before Starting

- [ ] Ensure `migrate-frontend-to-context-manager` is complete (currently 50/65)
- [ ] Read full `design.md` and `proposal.md`
- [ ] Set up local test environment

### Backend

- [ ] Add auto-save hook to FSM
- [ ] Create action endpoints
- [ ] Create state polling endpoint
- [ ] Add integration tests
- [ ] Verify auto-save with logging

### Frontend

- [ ] Add action methods to `BackendContextService`
- [ ] Create polling hook (`useChatStateSync`)
- [ ] Update `useChatManager` to use actions
- [ ] Remove manual persistence from Zustand slice
- [ ] Add reconciliation logic
- [ ] Update tests

### Validation

- [ ] Send message → verify auto-saved in backend logs
- [ ] Refresh page → verify messages restored
- [ ] Test network failure → verify optimistic rollback
- [ ] Test concurrent messages → verify no race conditions
- [ ] Performance test → measure latency impact

## Rollback Plan

If issues are found:

1. **Keep old CRUD endpoints**: They still work during transition
2. **Feature flag**: Add `USE_ACTION_API` flag to toggle between old/new
3. **Revert frontend**: Frontend can fall back to manual persistence
4. **No data loss**: Backend storage format unchanged

## Success Metrics

✅ **Zero manual persistence calls** in `chatSessionSlice.ts`  
✅ **Backend logs show auto-saves** after each FSM transition  
✅ **Refresh test passes**: Messages persist and restore correctly  
✅ **Performance**: Send message latency < 500ms (P95)  
✅ **Reliability**: No sync issues reported after 1 week of testing

## Questions?

- Review `design.md` for architectural decisions
- Review `proposal.md` for high-level overview
- Check `tasks.md` for detailed task breakdown
- Run `openspec show refactor-backend-first-persistence` for summary

