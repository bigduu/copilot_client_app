# Quick Start: Backend-First Persistence

## 🎯 What Changed

**Before**: Frontend manually saved each message to backend, but FSM wasn't triggered, so no assistant response.

**Now**: Backend automatically saves ALL messages when you call the action API, and FSM generates responses.

## ✅ Verification Steps

### Step 1: Rebuild the Backend

```bash
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
cargo build --package web_service
```

### Step 2: Start Backend with Verbose Logs

```bash
cd crates/web_service
RUST_LOG=info,web_service=debug cargo run
```

### Step 3: Run the Test Script

In a new terminal:

```bash
cd openspec/changes/refactor-backend-first-persistence
./test_backend_persistence.sh
```

**Expected output:**
```
✅ Context created: <uuid>
✅ Context has no messages (as expected)
✅ Action API call completed successfully
✅ User message was persisted
✅ Assistant message was persisted
✅ Backend persistence is working correctly!
```

### Step 4: Check Backend Logs

You should see:
```
INFO === send_message_action CALLED ===
INFO User message added to branch 'main'
INFO Auto-saving context after adding user message
DEBUG Saving dirty context <uuid>
INFO Context auto-saved successfully
INFO === FSM Loop Starting ===
INFO Creating mock assistant response
INFO Assistant message added to branch
DEBUG Saving dirty context <uuid>
INFO Context auto-saved successfully
```

## 🧪 Manual Test

### Test the Action API (New Way ✅)

```bash
# 1. Create a context
CONTEXT_ID=$(curl -s -X POST http://localhost:8080/v1/contexts \
  -H "Content-Type: application/json" \
  -d '{"model_id": "gpt-4", "mode": "chat", "system_prompt_id": null}' | jq -r '.id')

echo "Context ID: $CONTEXT_ID"

# 2. Send message via ACTION API
curl -X POST "http://localhost:8080/v1/contexts/${CONTEXT_ID}/actions/send_message" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello! Can you help me?"}' | jq

# 3. Verify BOTH messages are saved
curl "http://localhost:8080/v1/contexts/${CONTEXT_ID}/messages" | jq
```

**Expected result:**
```json
[
  {
    "role": "user",
    "content": "Hello! Can you help me?",
    "id": "..."
  },
  {
    "role": "assistant",
    "content": "I'm a mock response. I'll help you with your request...",
    "id": "..."
  }
]
```

### ⚠️ Compare with Old CRUD API (Deprecated)

```bash
# Old way (still works but NO FSM)
curl -X POST "http://localhost:8080/v1/contexts/${CONTEXT_ID}/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "content": "This wont trigger FSM",
    "branch": "main"
  }' | jq

# Check messages
curl "http://localhost:8080/v1/contexts/${CONTEXT_ID}/messages" | jq
```

**Result**: Only 1 new user message (NO assistant response)

**Backend logs**: 
```
WARN ⚠️  WARNING: This endpoint does NOT trigger FSM!
WARN ⚠️  No assistant response will be generated!
WARN ⚠️  Use POST /contexts/{id}/actions/send_message instead!
```

## 🔍 What the Backend Does Automatically

When you call `POST /actions/send_message`:

1. ✅ **Receives user message** (`"Hello!"`)
2. ✅ **Adds to context** (`context.add_message_to_branch()`)
3. ✅ **Marks dirty** (`context.mark_dirty()`)
4. ✅ **Auto-saves** (`session_manager.save_context()`)
   - Checks: `is_dirty()? YES`
   - Saves to database
   - Clears: `clear_dirty()`
5. ✅ **Runs FSM** (`run_fsm()`)
6. ✅ **Generates response** (mock assistant message)
7. ✅ **Adds response** (`context.add_message_to_branch()`)
8. ✅ **Marks dirty again** (`context.mark_dirty()`)
9. ✅ **Auto-saves again** (`session_manager.save_context()`)
10. ✅ **Returns complete context** (both messages)

**You don't do anything manually—it's all automatic!**

## 🖥️ Frontend Usage

### Updated Code (Already Done)

```typescript
// src/hooks/useChatManager.ts
const sendMessage = async (content: string) => {
  // 1. Add message locally (optimistic UI)
  await addMessage(chatId, userMessage);
  
  // 2. Call backend action API
  const backendService = new BackendContextService();
  const response = await backendService.sendMessageAction(chatId, content);
  //                                      ^^^^^^^^^^^^^^^^
  //                                      Backend handles ALL persistence
  
  // 3. Backend returns complete state
  console.log("Backend saved:", response);
  
  // 4. Trigger FSM for streaming/UI
  send({ type: "USER_SUBMITS", payload: { messages } });
};
```

### What Changed in Frontend

**Before:**
```typescript
// Manual persistence
await backendService.addMessage(chatId, message);  // ❌ Old CRUD
// No FSM trigger, no assistant response
```

**Now:**
```typescript
// Backend handles everything
await backendService.sendMessageAction(chatId, content);  // ✅ Action API
// Backend saves user message + generates & saves assistant response
```

## 📊 Verification Checklist

- [ ] Backend builds successfully
- [ ] Test script runs and shows ✅ for persistence
- [ ] Backend logs show "Auto-saving context" messages
- [ ] `GET /messages` returns both user and assistant messages
- [ ] Old CRUD endpoint shows deprecation warning in logs
- [ ] Frontend can send messages via UI
- [ ] Messages appear in UI immediately (optimistic)
- [ ] Messages persist after page refresh

## 🐛 Troubleshooting

### Issue: User message saved, but no assistant response

**Check:**
1. Backend logs for FSM execution
2. Look for "FSM: Entered ProcessingUserMessage state"
3. Verify "Creating mock assistant response" appears

**Solution:** FSM state transition logic may need implementation for your specific case.

### Issue: Messages not persisted

**Check:**
1. Backend logs for "Saving dirty context"
2. Verify dirty flag is set: look for `mark_dirty()` calls
3. Check database connection

**Solution:** Ensure `auto_save_context()` is called after message operations.

### Issue: Frontend shows error

**Check:**
1. Network tab: is action API endpoint being called?
2. Console: any errors from `sendMessageAction()`?
3. Backend: is endpoint responding?

**Solution:** Verify backend is running on correct port (default: 8080).

## 📚 Further Reading

- **[BACKEND_PERSISTENCE_FLOW.md](./BACKEND_PERSISTENCE_FLOW.md)** - Complete technical flow
- **[README.md](./README.md)** - Full implementation overview
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Detailed migration steps

## 🎉 Summary

Your backend now automatically persists all context messages when you call:
```
POST /v1/contexts/{id}/actions/send_message
```

**No manual persistence needed!** Just call the action endpoint, and the backend:
1. Saves your user message
2. Runs the FSM
3. Generates an assistant response
4. Saves the assistant response
5. Returns everything to you

**That's it!** The backend is now the single source of truth. 🚀

