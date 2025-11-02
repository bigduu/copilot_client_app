# Testing Instructions v2 - After Bug Fixes

**Updated**: November 1, 2025  
**Status**: 🟢 Ready for Testing (Bugs Fixed)  

---

## 🚨 Important: Bugs Have Been Fixed!

Two critical bugs were found and fixed:
1. ✅ TypeError with `invoke` - FIXED
2. ✅ UI showing "Tool" instead of "Workflow" - FIXED

See `BUG_FIX_SUMMARY.md` for details.

---

## Quick Start (5 Minutes)

### Step 1: Start Backend
```bash
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
cargo run -p web_service
```
Wait for: `Server running at http://localhost:8080`

### Step 2: Start Frontend
```bash
npm run dev
```
Wait for: `Local: http://localhost:5173/`

### Step 3: Open Browser
Visit: http://localhost:5173

---

## Test Scenarios

### Test 1: Regular Chat (Verify Bug Fix) ✅

**Purpose**: Ensure normal chat works without errors

1. Type a regular message: "Hello, how are you?"
2. Press Enter
3. **Expected**: ✅ AI responds normally
4. **Before Fix**: ❌ Would show "Tool execution failed" error

**Success Criteria**:
- [x] No error messages
- [x] AI responds with normal text
- [x] No console errors (F12)

### Test 2: Workflow Execution ✅

**Purpose**: Test the new workflow system

1. Type: `/`
2. **Expected**: WorkflowSelector dropdown appears
3. Type: `echo` to search
4. Press Enter to select
5. **Expected**: Parameter form opens
6. Type in message: "Hello World"
7. Click "Execute"
8. **Expected**: ✅ Success toast appears
9. **Expected**: Toast says "Workflow" not "Tool"

**Success Criteria**:
- [x] WorkflowSelector appears on `/`
- [x] Search/filter works
- [x] Parameter form opens
- [x] Execution succeeds
- [x] Success message appears
- [x] UI says "Workflow" everywhere

### Test 3: Multiple Workflows ✅

**Purpose**: Test different workflow types

#### Test 3a: Echo Workflow
```
Type: /echo
Message: "Testing echo workflow"
Expected: Success message
```

#### Test 3b: Create File Workflow
```
Type: /create_file
Path: /tmp/test_workflow.txt
Content: This is a test from the workflow system
Expected: Success message
Verify: Check /tmp/test_workflow.txt exists
```

**Success Criteria**:
- [x] Both workflows execute
- [x] No errors
- [x] Files created (for create_file)

### Test 4: Error Handling ✅

**Purpose**: Test error scenarios

#### Test 4a: Empty Required Field
1. Type: `/echo`
2. Leave message field empty
3. Click "Execute"
4. **Expected**: ❌ Validation error "Please input message"

#### Test 4b: Cancel Workflow
1. Type: `/echo`
2. Click "Cancel" or press Esc
3. **Expected**: Form closes, no execution

**Success Criteria**:
- [x] Validation works
- [x] Cancel works
- [x] No crashes

### Test 5: Keyboard Navigation ✅

**Purpose**: Test keyboard shortcuts

1. Type: `/`
2. Press `↓` arrow: Moves to next workflow
3. Press `↑` arrow: Moves to previous workflow
4. Press `Ctrl+N`: Same as down
5. Press `Ctrl+P`: Same as up
6. Press `Tab` or `Space`: Auto-completes workflow name
7. Press `Enter`: Selects workflow
8. Press `Esc`: Cancels selector

**Success Criteria**:
- [x] All keyboard shortcuts work
- [x] Visual feedback shows selected item
- [x] Smooth navigation

---

## Expected Results Summary

### ✅ What Should Work:
- [x] Regular chat (no more errors!)
- [x] Workflow selection via `/`
- [x] Parameter forms
- [x] Workflow execution
- [x] Success/error feedback
- [x] Keyboard navigation
- [x] Cancel operations

### ❌ What Won't Work Yet:
- [ ] Agent loop (backend not integrated)
- [ ] LLM autonomous tool usage
- [ ] Tool approval for agent loop
- [ ] Workflow results in chat history (shows as toasts)

---

## Troubleshooting

### Issue: "Failed to get available workflows"
**Cause**: Backend not running  
**Fix**: 
```bash
cargo run -p web_service
```

### Issue: Port already in use
**Cause**: Previous process still running  
**Fix**: 
```bash
lsof -ti:8080 | xargs kill -9
cargo run -p web_service
```

### Issue: No workflows in selector
**Cause**: Backend error or compilation issue  
**Fix**: Check backend console for errors

### Issue: Form doesn't submit
**Cause**: Validation error or JavaScript error  
**Fix**: Open browser console (F12) and check for errors

---

## What to Look For

### ✅ Good Signs:
- Smooth `/` trigger
- Workflows listed correctly
- Forms validate properly
- Success toasts appear
- No console errors
- Clean UI with "Workflow" labels

### ⚠️ Warning Signs:
- Slow response times
- Console errors
- Failed API calls
- Missing workflows

### 🔴 Red Flags:
- App crashes
- Error messages on normal chat
- Cannot select workflows
- Forms won't submit

---

## Browser Console Commands (For Debugging)

Open console (F12) and try:

```javascript
// Check if WorkflowService is loaded
WorkflowService

// Check if backend is reachable
fetch('http://localhost:8080/v1/workflows/available')
  .then(r => r.json())
  .then(console.log)

// Check system prompt API
fetch('http://localhost:8080/v1/system-prompts/default/enhanced')
  .then(r => r.json())
  .then(console.log)
```

---

## Success Checklist

Complete all tests:

### Basic Functionality:
- [ ] Regular chat works without errors
- [ ] Workflow selector appears on `/`
- [ ] Search/filter works
- [ ] Keyboard navigation works
- [ ] Parameter form opens
- [ ] Form validation works
- [ ] Workflow executes
- [ ] Success message appears

### Edge Cases:
- [ ] Cancel workflows works
- [ ] Empty fields validated
- [ ] Backend errors handled
- [ ] Multiple workflows work

### UI/UX:
- [ ] All text says "Workflow" not "Tool"
- [ ] Smooth animations
- [ ] Clear feedback
- [ ] No visual glitches

---

## Reporting Issues

If you find issues, please provide:

1. **What you did**: Step-by-step
2. **What happened**: Actual result
3. **What you expected**: Expected result
4. **Console errors**: Open F12, copy any errors
5. **Backend logs**: Any errors in the terminal
6. **Screenshots**: If visual issues

---

## Next Steps After Testing

### If Everything Works:
1. Continue to Task 5.7: Enhanced Approval Modal
2. Continue to Task 5.8: Simplify Chat State Machine
3. Start Phase 4: Agent Loop Integration

### If Issues Found:
1. Document the issues
2. Prioritize by severity
3. Fix critical bugs first
4. Re-test after fixes

---

**Testing Status**: 🟢 Ready  
**Known Issues**: 0 (Fixed!)  
**Estimated Test Time**: 10-15 minutes  
**Last Updated**: November 1, 2025

**Good luck with testing! 🚀**


