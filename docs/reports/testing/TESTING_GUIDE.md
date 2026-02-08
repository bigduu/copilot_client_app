# Testing Guide - Agent Loop & Workflow System

## Overview

This testing guide covers all new features implemented in this release:
- Agent Loop tool calls
- Tool approval mechanism
- Error handling and retry
- New Workflow system
- Deprecated endpoints

---

## 🚀 Quick Smoke Test (5 minutes)

### Purpose
Verify basic system functionality.

### Steps

#### 1. Start Application
```bash
# Terminal 1: Start backend
cd /Users/bigduu/Workspace/TauriProjects/copilot_chat
cargo run --bin web_service

# Terminal 2: Start frontend (new terminal window)
yarn tauri dev
```

#### 2. Basic Chat Test
- [ ] Create new chat
- [ ] Send simple message: "Hello"
- [ ] Verify response received
- [ ] Verify message saved to backend

**Expected Result**: Basic chat functionality works normally

#### 3. Compilation Check
```bash
# Check backend compilation
cargo check --workspace

# Check frontend compilation
yarn build
```

**Expected Result**: Zero compilation errors

---

## 🔧 Agent Loop Tool Call Tests

### Test 1: Read File (read_file)

**Purpose**: Verify LLM can autonomously call read_file tool

#### Steps
1. Create new chat
2. Send message:
   ```
   Please read the first 10 lines of README.md file
   ```

#### Expected Behavior
- [ ] LLM generates JSON tool call
- [ ] Backend parses tool call
- [ ] Execute `read_file` tool
- [ ] Tool result returned to LLM
- [ ] LLM generates final response with file content summary
- [ ] **No user approval required** (because it's a read operation)

#### Verification Points
- [ ] See tool call in backend logs:
  ```
  [ChatService] Tool call detected: read_file
  [AgentService] Executing tool: read_file
  ```
- [ ] Frontend displays final text response (not tool call JSON)
- [ ] Message history contains tool call and result

#### Troubleshooting
- If LLM doesn't call tool → Check if system prompt contains tool definitions
- If tool execution fails → Check if file path is correct

---

### Test 2: Search Files (search)

**Purpose**: Verify search tool works normally

#### Steps
1. Send message:
   ```
   Search for all .rs files in the project
   ```

#### Expected Behavior
- [ ] LLM calls `search` tool
- [ ] Returns matching file list
- [ ] LLM summarizes search results

#### Verification Points
- [ ] Search results are accurate
- [ ] No more than 20 results (tool limit)
- [ ] Search depth no more than 3 levels (tool limit)

---

### Test 3: Multi-step Tool Chain

**Purpose**: Verify agent loop can consecutively call multiple tools

#### Steps
1. Send complex task:
   ```
   Please search for Cargo.toml files in the project, then read its content and tell me the project name
   ```

#### Expected Behavior
1. **Step 1**: LLM calls `search` tool to find Cargo.toml
   - `terminate: false` (needs to continue)
2. **Step 2**: LLM uses search results, calls `read_file` to read file
   - `terminate: false` (needs to process)
3. **Step 3**: LLM analyzes content, returns final text response
   - No longer calls tools

#### Verification Points
- [ ] Agent loop automatically executes multiple steps
- [ ] Each tool call result correctly passed to next step
- [ ] Final response is accurate (contains project name)
- [ ] User only sees final response, not intermediate tool calls

#### Backend Log Example
```
[AgentService] Iteration 1: Tool call detected
[AgentService] Executing tool: search
[AgentService] Iteration 2: Tool call detected
[AgentService] Executing tool: read_file
[AgentService] Iteration 3: Text response received, stopping loop
```

---

## ✅ Tool Approval Tests

### Test 4: Create File (Requires Approval)

**Purpose**: Verify tools requiring approval pause waiting for user confirmation

#### Steps
1. Send message:
   ```
   Please create a test file test_output.txt with content "Hello from agent"
   ```

#### Expected Behavior
1. **LLM generates tool call**:
   ```json
   {
     "tool": "create_file",
     "parameters": {
       "path": "test_output.txt",
       "content": "Hello from agent"
     },
     "terminate": true
   }
   ```

2. **Backend pauses agent loop**:
   - Detects `create_file.requires_approval == true`
   - Creates `ApprovalRequest`
   - Returns `ServiceResponse::AwaitingAgentApproval`

3. **Frontend should display approval modal**:
   ⚠️ **Note**: This step can only be tested after frontend integration is complete
   - Modal title: "Agent Tool Call Approval"
   - Tool name: `create_file`
   - Parameter display: `path` and `content`

4. **User approves**:
   - Click "Approve" button
   - Frontend calls: `POST /v1/chat/{session_id}/approve-agent`

5. **Agent loop continues**:
   - Execute `create_file` tool
   - File is created
   - Return final response

#### Verification Points
- [ ] Agent loop pauses before approval
- [ ] Approval request stored in `ApprovalManager`
- [ ] Approval API endpoint works normally
- [ ] Tool executes successfully after approval
- [ ] File is actually created

#### Manual API Test (if frontend not integrated)
```bash
# 1. Get session_id (from backend logs or database)
SESSION_ID="<your-session-id>"

# 2. After sending message requiring approval, check approval request
# (Need to implement GET /v1/chat/{session_id}/pending-approval endpoint)

# 3. Manual approval
REQUEST_ID="<request-id-from-logs>"
curl -X POST "http://localhost:8000/v1/chat/${SESSION_ID}/approve-agent" \
  -H "Content-Type: application/json" \
  -d "{
    \"request_id\": \"${REQUEST_ID}\",
    \"approved\": true
  }"

# 4. Check response and file creation
ls -la test_output.txt
cat test_output.txt
```

---

### Test 5: Reject Tool Call

**Purpose**: Verify user can reject tool call

#### Steps
1. Send request requiring approval (e.g., create file)
2. **Reject** tool call (provide reason)

#### Expected Behavior
- [ ] Agent loop receives rejection decision
- [ ] Rejection reason returned to LLM
- [ ] LLM generates appropriate response (e.g., apology or alternative solution)
- [ ] Tool not executed (file not created)

#### Manual API Test
```bash
curl -X POST "http://localhost:8000/v1/chat/${SESSION_ID}/approve-agent" \
  -H "Content-Type: application/json" \
  -d "{
    \"request_id\": \"${REQUEST_ID}\",
    \"approved\": false,
    \"reason\": "I don't want to create this file"
  }"
```

---

## 🔥 Error Handling and Retry Tests

### Test 6: Tool Execution Failure

**Purpose**: Verify error handling when tool execution fails

#### Steps
1. Send request that will cause tool failure:
   ```
   Please read a non-existent file: /nonexistent/file.txt
   ```

#### Expected Behavior
1. **Tool execution fails**
2. **Error recorded**: `tool_execution_failures` increments
3. **Structured error feedback to LLM**:
   ```
   Error executing tool 'read_file': No such file or directory

   You have 2 retries remaining.
   Please try a different approach or ask the user for help.
   ```
4. **LLM response**:
   - May try different path
   - Or explain to user that file doesn't exist

#### Verification Points
- [ ] Error captured, doesn't cause crash
- [ ] Error message returned to LLM
- [ ] LLM generates reasonable response
- [ ] Agent loop continues (not interrupted)

#### Backend Log Check
```
[ChatService] Tool execution failed: read_file
[AgentService] Recording tool failure (1/3)
[ChatService] Sending error feedback to LLM
```

---

### Test 7: Timeout Handling

**Purpose**: Verify long-running tools timeout

#### Preparation
Need to create a test scenario that will timeout. Simplest method is to temporarily modify `AgentLoopConfig`:

```rust
// Temporarily modify in agent_service.rs
pub struct AgentLoopConfig {
    // ...
    pub tool_execution_timeout: Duration::from_secs(5), // Change to 5 seconds for testing
}
```

#### Steps
1. Send command requiring long execution (if command tool has been migrated to workflow, skip this test)

#### Expected Behavior
- [ ] Tool execution times out after 5 seconds
- [ ] Timeout error returned to LLM
- [ ] Agent loop records timeout as failure
- [ ] LLM receives timeout feedback

#### Backend Log
```
[ChatService] Tool execution timed out after 60s
[AgentService] Recording tool failure (timeout)
```

**Important**: Restore configuration to 60 seconds after testing

---

### Test 8: Maximum Retry Count

**Purpose**: Verify agent loop stops after reaching maximum retry count

#### Steps
1. Construct scenario that will fail consecutively (e.g., continuously read non-existent files)
2. Let LLM retry multiple times

#### Expected Behavior
- **1st failure**: Error feedback, 2 retries remaining
- **2nd failure**: Error feedback, 1 retry remaining
- **3rd failure**: Error feedback, 0 retries remaining
- **Stop loop**: Return final error response to user

#### Verification Points
- [ ] Agent loop stops after 3 failures
- [ ] `should_continue()` returns false
- [ ] User receives error explanation

---

### Test 9: Maximum Iteration Count

**Purpose**: Verify agent loop doesn't run infinitely

#### Steps
1. Send task that may cause long loop
2. Observe if stops after 10 iterations

#### Expected Behavior
- [ ] Agent loop executes maximum 10 iterations
- [ ] Returns partial results or error after reaching limit
- [ ] Doesn't run infinitely

#### Backend Log
```
[AgentService] Iteration 10 reached, stopping loop
[AgentService] Max iterations exceeded
```

---

## 🔄 Workflow System Tests

### Test 10: List Available Workflows

#### API Test
```bash
curl http://localhost:8000/v1/workflows/available
```

#### Expected Response
```json
{
  "workflows": [
    {
      "name": "echo",
      "description": "Echoes back the provided message",
      "category": "general",
      "requires_approval": false,
      ...
    },
    {
      "name": "create_file",
      "description": "Creates a new file with the specified content",
      "category": "file_operations",
      "requires_approval": true,
      ...
    },
    {
      "name": "execute_command",
      "description": "Executes a shell command...",
      "category": "system",
      "requires_approval": true,
      ...
    },
    {
      "name": "delete_file",
      "description": "Deletes a file from the filesystem...",
      "category": "file_operations",
      "requires_approval": true,
      ...
    }
  ]
}
```

#### Verification Points
- [ ] Returns all 4 workflows
- [ ] Each workflow contains correct metadata
- [ ] JSON format is correct

---

### Test 11: Execute EchoWorkflow

**Purpose**: Test simplest workflow

#### API Test
```bash
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "echo",
    "parameters": {
      "message": "Hello, Workflow!"
    }
  }'
```

#### Expected Response
```json
{
  "success": true,
  "result": {
    "echo": "Hello, Workflow!"
  }
}
```

#### Verification Points
- [ ] Workflow executes successfully
- [ ] Returns correct echo content
- [ ] Response format is correct

---

### Test 12: ExecuteCommandWorkflow

**Purpose**: Test command execution workflow (replaces deprecated execute_command tool)

#### API Test
```bash
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "execute_command",
    "parameters": {
      "command": "echo \"Test command\""
    }
  }'
```

#### Expected Response
```json
{
  "success": true,
  "result": {
    "exit_code": 0,
    "stdout": "Test command\n",
    "stderr": "",
    "message": "Command executed successfully"
  }
}
```

#### Verification Points
- [ ] Command executes successfully
- [ ] stdout contains expected output
- [ ] exit_code is 0
- [ ] 5-minute timeout protection is active

#### Security Test
- [ ] Try dangerous command (should be intercepted by approval mechanism)
- [ ] Verify custom_prompt contains security warning

---

### Test 13: DeleteFileWorkflow

**Purpose**: Test file deletion workflow (requires explicit confirmation)

#### Preparation
```bash
# Create test file
echo "Test content" > /tmp/test_delete.txt
```

#### API Test
```bash
# Test 1: Without confirmation (should fail)
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "delete_file",
    "parameters": {
      "path": "/tmp/test_delete.txt",
      "confirm": "wrong"
    }
  }'

# Expected: Error "Deletion not confirmed..."

# Test 2: With confirmation (should succeed)
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "delete_file",
    "parameters": {
      "path": "/tmp/test_delete.txt",
      "confirm": "DELETE"
    }
  }'

# Verify file is deleted
ls /tmp/test_delete.txt  # Should show "No such file"
```

#### Verification Points
- [ ] Rejects deletion without "DELETE" confirmation
- [ ] Successfully deletes with "DELETE" confirmation
- [ ] File is actually deleted
- [ ] Returns error for non-existent file

---

### Test 14: CreateFileWorkflow

**Purpose**: Verify workflow version of create_file

#### API Test
```bash
curl -X POST http://localhost:8000/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_name": "create_file",
    "parameters": {
      "path": "/tmp/workflow_test.txt",
      "content": "Created by workflow"
    }
  }'

# Verify file creation
cat /tmp/workflow_test.txt
```

#### Verification Points
- [ ] File created successfully
- [ ] Content is correct
- [ ] Automatically creates parent directory if it doesn't exist

---

## ⚠️ Deprecated Endpoint Tests

### Test 15: Deprecation Warning

**Purpose**: Verify deprecated endpoints return warnings

#### API Test
```bash
# Test deprecated execute_tool endpoint
curl -X POST http://localhost:8000/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "read_file",
    "parameters": {
      "path": "README.md"
    }
  }' \
  -i  # Show headers
```

#### Verification Points
- [ ] Response headers contain `X-Deprecated: true`
- [ ] Backend logs contain deprecation warning
- [ ] Functionality still works (backward compatible)

#### Backend Log Check
```
WARN [tool_controller] Deprecated endpoint called: /tools/execute
```

---

## 🧪 Integration Tests

### Test 16: Complete Conversation Flow

**Purpose**: Test complete multi-turn conversation with tool calls

#### Scenario
```
User: Please help me analyze project structure
 ↓
LLM: [Calls search tool to find files]
 ↓
Agent Loop: [Executes search, returns results]
 ↓
LLM: [Calls read_file to read key files]
 ↓
Agent Loop: [Executes read_file, returns content]
 ↓
LLM: [Returns final analysis result]
 ↓
User: Please create a TODO.md file summarizing your findings
 ↓
LLM: [Calls create_file tool]
 ↓
Agent Loop: [Detects approval needed, pauses]
 ↓
Frontend: [Displays approval modal]
 ↓
User: [Approves]
 ↓
Agent Loop: [Executes create_file, file created]
 ↓
LLM: [Confirms completion]
```

#### Verification Points
- [ ] Complete flow without interruption
- [ ] Tool calls execute correctly
- [ ] Approval mechanism works normally
- [ ] Conversation history saved correctly
- [ ] User experience is smooth

---

## 📝 Test Checklist

### Smoke Test (Required)
- [ ] Application starts successfully
- [ ] Basic chat function works
- [ ] Zero compilation errors
- [ ] Zero linter errors

### Agent Loop Functions
- [ ] read_file tool auto-calls
- [ ] search tool auto-calls
- [ ] Multi-step tool chain works
- [ ] Tool results correctly passed

### Approval Mechanism
- [ ] create_file requires approval
- [ ] Approval API endpoint works
- [ ] Reject tool call works
- [ ] Approval request correctly stored

### Error Handling
- [ ] Tool execution failure captured
- [ ] Error feedback to LLM
- [ ] Timeout mechanism works
- [ ] Maximum retry count active
- [ ] Maximum iteration count active

### Workflow System
- [ ] List workflows works
- [ ] EchoWorkflow executes successfully
- [ ] ExecuteCommandWorkflow works
- [ ] DeleteFileWorkflow works (with confirmation)
- [ ] CreateFileWorkflow works

### Deprecation Warnings
- [ ] Deprecated endpoints return warnings
- [ ] Warnings logged
- [ ] Functionality still backward compatible

---

## 🔍 Debugging Tips

### View Backend Logs
```bash
# Show all logs at startup
RUST_LOG=debug cargo run --bin web_service
```

### Key Log Locations
- **Agent Loop Start**: `[AgentService] Starting agent loop`
- **Tool Call**: `[AgentService] Executing tool: {tool_name}`
- **Approval Request**: `[ChatService] Tool requires approval`
- **Error**: `[AgentService] Tool execution failed`
- **Iteration**: `[AgentService] Iteration {n}`

### Database Check
```sql
-- View chat context
SELECT * FROM chat_sessions WHERE id = '<session-id>';

-- View message history
SELECT * FROM messages WHERE session_id = '<session-id>' ORDER BY created_at;

-- View tool call records (if implemented)
SELECT * FROM tool_call_history WHERE session_id = '<session-id>';
```

### API Debugging
Use `httpie` or `Postman` for more friendly API testing:

```bash
# Install httpie
brew install httpie

# Usage example
http POST localhost:8000/v1/workflows/execute \
  workflow_name=echo \
  parameters:='{"message": "test"}'
```

---

## ⚡ Automated Test Recommendations

### Unit Tests (Recommended)

```rust
// crates/web_service/src/services/approval_manager.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_approve_request() {
        let manager = ApprovalManager::new();
        let session_id = Uuid::new_v4();
        let tool_call = /* ... */;

        // Create request
        let request_id = manager.create_request(
            session_id,
            tool_call,
            "test_tool".to_string(),
            "Test description".to_string()
        ).await.unwrap();

        // Verify request exists
        let pending = manager.get_pending_request(&session_id).await;
        assert!(pending.is_some());

        // Approve request
        let result = manager.approve_request(&request_id, true, None).await;
        assert!(result.is_ok());

        // Verify request removed
        let pending = manager.get_pending_request(&session_id).await;
        assert!(pending.is_none());
    }
}
```

### Integration Tests (Recommended)

```rust
// crates/web_service/tests/agent_loop_tests.rs
#[tokio::test]
async fn test_agent_loop_with_approval() {
    // Start test server
    let app_state = create_test_app_state().await;

    // Send message requiring approval
    let response = send_message(
        app_state.clone(),
        "Create a test file"
    ).await;

    // Verify returns approval request
    assert!(matches!(response, ServiceResponse::AwaitingAgentApproval { .. }));

    // Approve
    approve_agent_tool_call(app_state, request_id, true).await;

    // Verify tool execution
    assert!(Path::new("test_file.txt").exists());
}
```

---

## 📊 Test Report Template

After completing tests, use this template to record results:

```markdown
# Agent Loop Test Report
Date: YYYY-MM-DD
Tester: [Your Name]

## Test Environment
- OS: macOS / Linux / Windows
- Rust Version: [cargo --version]
- Node Version: [node --version]

## Test Results Summary
- Total Tests: X
- Passed: Y
- Failed: Z
- Skipped: W

## Detailed Results

### ✅ Passed Tests
1. read_file tool call - ✅
2. search tool call - ✅
...

### ❌ Failed Tests
1. create_file approval - ❌
   - Reason: Approval modal not displayed
   - Error Message: [Detailed error]
   - To be fixed

### ⏭️ Skipped Tests
1. Frontend approval UI - ⏭️
   - Reason: Frontend integration not complete
   - Plan: Complete in next sprint

## Issues Found
1. [Issue 1 description]
2. [Issue 2 description]

## Recommendations
1. [Improvement recommendation 1]
2. [Improvement recommendation 2]
```

---

## 🎯 Priority

### P0 - Must Test (Blocking Release)
- [ ] Basic chat function
- [ ] read_file tool call
- [ ] Tool execution failure handling
- [ ] Workflow execution

### P1 - Should Test (Important Functions)
- [ ] Multi-step tool chain
- [ ] Tool approval mechanism
- [ ] Timeout handling
- [ ] All workflows

### P2 - Can Test (Non-critical)
- [ ] Deprecation warnings
- [ ] Maximum iteration count
- [ ] Boundary cases

---

## 📞 Getting Help

If you encounter issues:
1. Check backend logs (`RUST_LOG=debug`)
2. View documentation (`docs/architecture/`)
3. Reference implementation summary (`IMPLEMENTATION_SESSION_COMPLETE.md`)

---

## ✨ After Testing

After completing tests:
1. Record test results
2. Create issue to track failed tests
3. Update documentation (if needed)
4. Prepare for next phase work

---

**Good luck with testing! 🚀**

