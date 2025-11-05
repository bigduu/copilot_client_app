# Backend-First Persistence Flow

## Overview

This document explains how the backend automatically persists all context messages when forwarding them to/from the frontend. The backend is the **single source of truth** for all chat state.

## Complete Message Flow

```
┌──────────────┐                                  ┌──────────────────────────────┐
│   Frontend   │                                  │          Backend             │
│   (React)    │                                  │      (Rust + FSM)            │
└──────┬───────┘                                  └──────────┬───────────────────┘
       │                                                     │
       │ 1. User types "hi"                                 │
       │                                                     │
       │ 2. POST /actions/send_message                      │
       │    { "content": "hi" }                             │
       ├────────────────────────────────────────────────────>│
       │                                                     │
       │                                                     │ 3. Create user message
       │                                                     │    InternalMessage { role: User, content: "hi" }
       │                                                     │
       │                                                     │ 4. Add to context
       │                                                     │    context.add_message_to_branch("main", msg)
       │                                                     │    context.mark_dirty()  // Sets dirty flag
       │                                                     │
       │                                                     │ 5. Auto-save #1
       │                                                     │    session_manager.save_context(&mut context)
       │                                                     │    → Checks: is_dirty()? YES
       │                                                     │    → Persists to DB
       │                                                     │    → Calls: clear_dirty()
       │                                                     │    ✅ USER MESSAGE SAVED
       │                                                     │
       │                                                     │ 6. Run FSM
       │                                                     │    State: ProcessingUserMessage
       │                                                     │
       │                                                     │ 7. FSM creates assistant response
       │                                                     │    InternalMessage { role: Assistant, content: "Hello!" }
       │                                                     │    context.add_message_to_branch("main", assistant_msg)
       │                                                     │    context.mark_dirty()  // Sets dirty flag again
       │                                                     │
       │                                                     │ 8. Auto-save #2
       │                                                     │    session_manager.save_context(&mut context)
       │                                                     │    → Checks: is_dirty()? YES
       │                                                     │    → Persists to DB
       │                                                     │    → Calls: clear_dirty()
       │                                                     │    ✅ ASSISTANT MESSAGE SAVED
       │                                                     │
       │                                                     │ 9. Prepare response
       │ 10. Response with complete state                   │    ActionResponse { success: true, context: [...] }
       │<────────────────────────────────────────────────────┤
       │                                                     │
       │ 11. Update local state                             │
       │     (reconciliation)                               │
       │                                                     │
```

## Key Components

### 1. **Dirty Flag Optimization** (`context.rs`)

```rust
pub struct ChatContext {
    // ... other fields
    #[serde(skip)]
    pub(crate) dirty: bool,  // ← Tracks if context needs saving
}

impl ChatContext {
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn clear_dirty(&mut self) {
        self.dirty = false;
    }

    pub fn add_message_to_branch(&mut self, branch: &str, msg: InternalMessage) {
        // ... add message to pool
        self.mark_dirty();  // ← Automatically mark dirty
    }
}
```

**Purpose**: Only persist when changes have been made, preventing unnecessary DB writes.

### 2. **Auto-Save in Session Manager** (`session_manager.rs`)

```rust
pub async fn save_context(&self, context: &mut ChatContext) -> Result<(), AppError> {
    if !context.is_dirty() {
        debug!("Context {} not dirty, skipping save", context.id);
        return Ok(());  // ← No-op if clean
    }

    debug!("Saving dirty context {}", context.id);

    // Convert to DTO and save to DB
    let dto = ChatContextDTO::from(context.clone());
    self.context_repo
        .save_or_update_context(&context.id.to_string(), &dto)
        .await?;

    context.clear_dirty();  // ← Mark as clean after save
    Ok(())
}
```

**Purpose**: Smart persistence that checks dirty flag before saving.

### 3. **FSM Auto-Save Hooks** (`chat_service.rs`)

```rust
pub async fn process_message(&mut self, message: String) -> Result<ServiceResponse, AppError> {
    let context = self.session_manager.load_context(self.conversation_id).await?;
    let mut context_lock = context.lock().await;

    // Add user message
    let user_message = InternalMessage { role: Role::User, content: [...] };
    context_lock.add_message_to_branch("main", user_message);  // ← Marks dirty
    drop(context_lock);

    // ✅ AUTO-SAVE #1: User message persisted
    self.auto_save_context(&context).await?;

    // Run FSM (generates assistant response)
    self.run_fsm(context).await
}

async fn run_fsm(&mut self, context: Arc<Mutex<ChatContext>>) -> Result<ServiceResponse, AppError> {
    loop {
        // ... FSM state transition logic

        // After assistant message added
        context.add_message_to_branch("main", assistant_msg);  // ← Marks dirty

        // ✅ AUTO-SAVE #2: Assistant message persisted
        self.auto_save_context(&context).await?;

        // ... continue FSM loop
    }
}
```

**Purpose**: Automatic persistence after every significant state change.

### 4. **Action-Based API** (`context_controller.rs`)

```rust
#[post("/contexts/{id}/actions/send_message")]
pub async fn send_message_action(
    path: Path<Uuid>,
    req: Json<SendMessageActionRequest>,
    app_state: Data<AppState>,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let content = req.content.clone();

    info!("=== send_message_action CALLED ===");
    info!("Context ID: {}", context_id);
    info!("Message: {}", content);

    // Create ChatService and process message
    let mut chat_service = ChatService::new(
        context_id,
        app_state.session_manager.clone(),
        // ... other params
    );

    // ✅ This handles EVERYTHING:
    // - Save user message
    // - Run FSM
    // - Generate response
    // - Save response
    let response = chat_service.process_message(content).await?;

    info!("Action completed successfully");
    Ok(HttpResponse::Ok().json(ActionResponse {
        success: true,
        context: Some(response),
    }))
}
```

**Purpose**: High-level API that encapsulates entire message processing flow.

### 5. **Frontend Integration** (`useChatManager.ts`)

```typescript
const sendMessage = useCallback(
  async (content: string, images?: ImageFile[]) => {
    // 1. Optimistic UI update (local only)
    const userMessage = { role: "user", content, id: crypto.randomUUID() };
    await addMessage(chatId, userMessage); // ← NO backend persistence

    // 2. Call backend action API
    const backendService = new BackendContextService();
    const actionResponse = await backendService.sendMessageAction(
      chatId,
      content,
    );
    //                                              ^^^^^^^^^^^^^^^^
    //                                              Backend handles ALL persistence

    // 3. Backend returns complete state (user + assistant messages)
    console.log("Backend saved:", actionResponse);

    // 4. Trigger FSM for streaming/UI updates
    send({ type: "USER_SUBMITS", payload: { messages, chat } });
  },
  [chatId, addMessage, send],
);
```

**Purpose**: Frontend only does optimistic updates; backend handles all persistence.

## Persistence Guarantees

### ✅ What Gets Persisted Automatically

1. **User messages** - When received via action API
2. **Assistant messages** - After FSM generates response
3. **Tool call messages** - During tool execution flow
4. **Tool result messages** - After tool completes
5. **System prompt changes** - When context config updated
6. **Branch operations** - When messages added to branches

### ⚠️ When Persistence Happens

| Event                  | Trigger                       | Persistence Point               |
| ---------------------- | ----------------------------- | ------------------------------- |
| User sends message     | `POST /actions/send_message`  | After `add_message_to_branch()` |
| FSM generates response | FSM state transition          | After assistant message added   |
| Tool call approved     | `POST /actions/approve_tools` | After tool messages added       |
| Context state changes  | Any `mark_dirty()` call       | Next `auto_save_context()`      |

### 🚫 What Doesn't Get Persisted

1. **Optimistic UI updates** - Local-only until backend confirms
2. **Streaming chunks** - Only final message persisted
3. **Temporary state** - FSM internal state (not part of context)

## Migration from Old CRUD Approach

### ❌ Old Way (Manual Persistence)

```typescript
// Frontend manually saves each message
await backendService.addMessage(chatId, { role: "user", content: "hi" });
// ⚠️ No FSM triggered
// ⚠️ No assistant response
// ⚠️ Frontend responsible for consistency
```

### ✅ New Way (Backend-First)

```typescript
// Backend handles everything
await backendService.sendMessageAction(chatId, "hi");
// ✅ User message saved
// ✅ FSM runs
// ✅ Assistant response generated and saved
// ✅ Backend guarantees consistency
```

## Benefits

### 1. **Single Source of Truth**

- Backend DB is authoritative
- No frontend/backend state drift
- Easier debugging

### 2. **Automatic Consistency**

- All related messages saved together
- FSM state transitions atomic
- No partial updates

### 3. **Optimized Performance**

- Dirty flag prevents redundant saves
- Batch operations possible
- Reduced DB writes

### 4. **Simplified Frontend**

- No manual persistence logic
- Just call action API
- Backend handles complexity

## Verification

### Check Backend Logs

After sending "hi", you should see:

```
INFO  === send_message_action CALLED ===
INFO  Context ID: a981c59a-9293-4237-bb48-bf9439f5f2fa
INFO  Message: hi
INFO  === ChatService::process_message START ===
INFO  User message added to branch 'main'
INFO  Auto-saving context after adding user message
DEBUG Saving dirty context a981c59a-9293-4237-bb48-bf9439f5f2fa
INFO  Context auto-saved successfully
INFO  === FSM Loop Starting ===
INFO  FSM: Entered ProcessingUserMessage state
INFO  Creating mock assistant response
INFO  Assistant message added to branch
DEBUG Saving dirty context a981c59a-9293-4237-bb48-bf9439f5f2fa
INFO  Context auto-saved successfully
INFO  Action completed successfully
```

### Query Database

```bash
curl http://localhost:8080/v1/contexts/{context_id}/messages
```

Should return BOTH messages:

```json
[
  {
    "role": "user",
    "content": "hi",
    "id": "..."
  },
  {
    "role": "assistant",
    "content": "I'm a mock response...",
    "id": "..."
  }
]
```

## Related Files

- **Backend Core**: `crates/context_manager/src/structs/context.rs`
- **Session Management**: `crates/web_service/src/services/session_manager.rs`
- **FSM Logic**: `crates/web_service/src/services/chat_service.rs`
- **API Endpoints**: `crates/web_service/src/controllers/context_controller.rs`
- **Frontend Service**: `src/services/BackendContextService.ts`
- **Frontend Hook**: `src/hooks/useChatManager.ts`
- **State Management**: `src/store/slices/chatSessionSlice.ts`

## Summary

The backend now **automatically persists all context messages** when processing user requests through the action API. The frontend doesn't need to worry about persistence—it just calls the action endpoint and receives the complete, persisted state back. This ensures data consistency and simplifies the frontend architecture.
