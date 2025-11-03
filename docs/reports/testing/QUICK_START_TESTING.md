# Quick Start - Testing the Workflow System

**2-Minute Setup Guide** ⚡

---

## Step 1: Start Backend (Terminal 1)

```bash
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
cargo run -p web_service
```

**Wait for**: `Server running at http://localhost:8080`

---

## Step 2: Start Frontend (Terminal 2)

```bash
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
npm run dev
# or: yarn dev
```

**Wait for**: `Local: http://localhost:5173/`

---

## Step 3: Open Browser

Visit: `http://localhost:5173`

---

## Step 4: Test Workflows

### Test 1: Echo Workflow

1. Click in the message input
2. Type: `/`
3. See the WorkflowSelector appear
4. Type: `echo` (to search)
5. Press `Enter` to select
6. Parameter form appears
7. Type in message field: `Hello World`
8. Click `Execute`
9. ✅ Success message appears!

### Test 2: Create File Workflow

1. Type: `/`
2. Select `create_file`
3. Fill in:
   - **path**: `/tmp/test.txt`
   - **content**: `This is a test file`
4. Click `Execute`
5. ✅ Success message appears!
6. Check `/tmp/test.txt` exists

---

## Keyboard Shortcuts

- `↑` / `↓` - Navigate workflows
- `Ctrl+P` / `Ctrl+N` - Navigate workflows
- `Enter` - Select workflow
- `Space` / `Tab` - Auto-complete workflow name
- `Esc` - Cancel

---

## API Testing (Optional)

```bash
# List workflows
curl http://localhost:8080/v1/workflows/available

# Execute echo
curl -X POST http://localhost:8080/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{"name": "echo", "parameters": {"message": "Test"}}'
```

---

## Troubleshooting

### Backend won't start?
```bash
# Kill any process on port 8080
lsof -ti:8080 | xargs kill -9
cargo run -p web_service
```

### No workflows show up?
1. Check backend console for errors
2. Verify backend is running on port 8080
3. Check browser console (F12) for errors

### Form doesn't appear?
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for API call status

---

## Success Criteria ✅

You should see:
- [x] WorkflowSelector dropdown when typing `/`
- [x] Workflows listed: `echo`, `create_file`
- [x] Parameter form opens after selection
- [x] "Execute" button works
- [x] Success toast message appears
- [x] Input clears after execution

---

**That's it!** You now have a working workflow system! 🎉

For more details, see `READY_FOR_TESTING.md`


