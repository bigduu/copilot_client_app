# Agent Loop Architecture

## Overview
The Agent Loop is a core component of the Copilot Chat system that enables autonomous LLM-driven tool usage. When the LLM generates structured JSON tool calls, the backend automatically executes them and feeds the results back to the LLM in a loop until a final text response is produced.

## Key Concepts

### 🤖 LLM-Driven Tools
**Tools** are low-level operations that the Language Model can autonomously invoke to accomplish tasks:
- **Read-only operations**: Safe information gathering
- **Approved write operations**: Require user approval before execution
- **Injected into system prompt**: LLM learns about available tools
- **Structured JSON format**: Consistent calling convention

### 👤 User-Invoked Workflows
**Workflows** are high-level operations that users explicitly trigger:
- **Complex multi-step procedures**: User-initiated actions
- **Destructive operations**: Require explicit user control
- **Workflow UI**: Form-based parameter input
- **Separate from agent loop**: Not available to LLM

### 🔄 Agent Loop Execution
The agent loop orchestrates the conversation between the LLM and tools:
1. **LLM Response**: LLM generates text or JSON tool call
2. **Tool Detection**: Backend parses response for tool calls
3. **Tool Execution**: If tool found, execute and capture result
4. **Result Feedback**: Feed result back to LLM as context
5. **Loop Continue**: Repeat until LLM produces final text response
6. **Termination**: Stop on text response or max iterations

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Message                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ChatService                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 1. Enhance System Prompt with Tools                    │    │
│  │    - Inject tool definitions                           │    │
│  │    - Add calling conventions                           │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 2. Send to LLM (Copilot API)                           │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Agent Loop (AgentService)                       │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Loop until text response or max iterations          │      │
│  │  ┌───────────────────────────────────────┐           │      │
│  │  │ 3. Parse LLM Response                 │           │      │
│  │  │    - Check for JSON tool call         │           │      │
│  │  │    - Validate format                  │           │      │
│  │  └───────────────────────────────────────┘           │      │
│  │               │                                       │      │
│  │               ▼                                       │      │
│  │  ┌───────────────────────────────────────┐           │      │
│  │  │ 4. Check Tool Approval                │           │      │
│  │  │    - If requires_approval=true        │           │      │
│  │  │      → Pause and wait for user        │           │      │
│  │  └───────────────────────────────────────┘           │      │
│  │               │                                       │      │
│  │               ▼                                       │      │
│  │  ┌───────────────────────────────────────┐           │      │
│  │  │ 5. Execute Tool (ToolExecutor)        │           │      │
│  │  │    - With timeout (60s)               │           │      │
│  │  │    - Capture result                   │           │      │
│  │  └───────────────────────────────────────┘           │      │
│  │               │                                       │      │
│  │               ▼                                       │      │
│  │  ┌───────────────────────────────────────┐           │      │
│  │  │ 6. Feed Result Back to LLM            │           │      │
│  │  │    - Append to conversation           │           │      │
│  │  │    - Continue loop                    │           │      │
│  │  └───────────────────────────────────────┘           │      │
│  │               │                                       │      │
│  │               └───────┐ Loop Back                     │      │
│  │                       │                               │      │
│  │                       ▼                               │      │
│  │  ┌───────────────────────────────────────┐           │      │
│  │  │ 7. Termination Check                  │           │      │
│  │  │    - Text response? → Done            │           │      │
│  │  │    - Max iterations? → Done           │           │      │
│  │  │    - Timeout? → Done                  │           │      │
│  │  │    - Max retries? → Done              │           │      │
│  │  └───────────────────────────────────────┘           │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Final Response to User                       │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### AgentService
**Location**: `crates/web_service/src/services/agent_service.rs`

**Responsibilities**:
- Parse LLM responses for tool calls
- Validate JSON tool call format
- Track agent loop state (iterations, timeouts, failures)
- Determine loop continuation/termination
- Record tool call history

**Key Types**:
```rust
pub struct AgentLoopState {
    pub iteration: usize,
    pub start_time: Instant,
    pub tool_call_history: Vec<ToolCallRecord>,
    pub parse_failures: usize,
    pub tool_execution_failures: usize,
    pub current_retry_tool: Option<String>,
}

pub struct AgentLoopConfig {
    pub max_iterations: usize,          // Default: 10
    pub timeout: Duration,               // Default: 300s (5 min)
    pub max_json_parse_retries: usize,  // Default: 3
    pub max_tool_execution_retries: usize, // Default: 3
    pub tool_execution_timeout: Duration,  // Default: 60s
}
```

### ChatService
**Location**: `crates/web_service/src/services/chat_service.rs`

**Responsibilities**:
- Orchestrate conversation flow
- Enhance system prompts with tools
- Execute agent loop
- Handle tool call approvals
- Manage conversation context
- Save messages to chat session

**Key Methods**:
```rust
impl ChatService {
    // Process user message and orchestrate agent loop
    pub async fn process_message(&mut self, message: String) -> Result<ServiceResponse>;
    
    // Continue agent loop after user approval
    pub async fn continue_agent_loop_after_approval(
        &mut self,
        request_id: Uuid,
        approved: bool,
        reason: Option<String>,
    ) -> Result<ServiceResponse>;
}
```

### SystemPromptEnhancer
**Location**: `crates/web_service/src/services/system_prompt_enhancer.rs`

**Responsibilities**:
- Inject tool definitions into system prompt
- Format tools as XML with structured metadata
- Add JSON calling conventions
- Add terminate flag explanation
- Optimize prompt size (truncate if needed)
- Cache enhanced prompts

### ToolExecutor
**Location**: `crates/tool_system/src/executor.rs`

**Responsibilities**:
- Execute tools by name
- Validate parameters
- Handle execution errors
- Return structured results
- Provide tool metadata

### ApprovalManager
**Location**: `crates/web_service/src/services/approval_manager.rs`

**Responsibilities**:
- Create approval requests for agent-initiated tool calls
- Store pending requests (by session ID and request ID)
- Process approval/rejection decisions
- Return approved tool call for execution

## Tool Call Format

### JSON Structure
The LLM generates tool calls in this exact format:

```json
{
  "tool": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "terminate": true
}
```

### Fields
- **`tool`** (required): Name of the tool to invoke
- **`parameters`** (required): Object containing tool parameters
- **`terminate`** (required): Boolean flag indicating if this is the final action

### Terminate Flag
The `terminate` flag guides the agent loop:
- **`true`**: This is the final action, stop loop after execution
- **`false`**: More actions needed, continue loop after execution

**LLM Guidelines** (from system prompt):
- Use `terminate=false` for information gathering (reading files, searching)
- Use `terminate=true` for final actions (creating files, executing commands)
- Multi-step tasks typically use `terminate=false` until the last step

## Agent Loop Lifecycle

### 1. Initialization
```
User sends message → ChatService receives
↓
System prompt enhanced with tools
↓
Message sent to LLM with enhanced prompt
```

### 2. LLM Response Processing
```
LLM response received
↓
AgentService.parse_tool_call() checks for JSON
↓
If JSON found → parse and validate
If text → return final response
If parsing fails → retry up to max_json_parse_retries
```

### 3. Tool Approval Check
```
Tool call parsed successfully
↓
Check ToolDefinition.requires_approval
↓
If true:
  - Create ApprovalRequest (ApprovalManager)
  - Return ServiceResponse::AwaitingAgentApproval
  - Pause agent loop
  - Wait for user response (POST /v1/chat/{session}/approve-agent)
↓
If false or after approval:
  - Proceed to execution
```

### 4. Tool Execution
```
Execute tool with timeout (default 60s)
↓
If success:
  - Record result in tool_call_history
  - Reset tool_execution_failures
  - Feed result back to LLM
↓
If failure:
  - Increment tool_execution_failures
  - Record failure in AgentLoopState
  - Feed error message back to LLM
  - Continue loop if retries available
↓
If timeout:
  - Record as failure
  - Feed timeout error to LLM
```

### 5. Loop Continuation
```
Check AgentService.should_continue()
↓
Continue if:
  - iteration < max_iterations (10)
  - elapsed_time < timeout (300s)
  - parse_failures < max_json_parse_retries (3)
  - tool_execution_failures < max_tool_execution_retries (3)
↓
Stop if:
  - LLM returns text response (not JSON)
  - terminate=true in tool call
  - Any limit exceeded
```

### 6. Termination
```
Final response or limit reached
↓
Save conversation to ChatSession
↓
Return ServiceResponse::FinalMessage to frontend
↓
Display to user
```

## Error Handling

### Tool Execution Failures
When a tool execution fails:

1. **Record Failure**: Increment `tool_execution_failures` in `AgentLoopState`
2. **Structured Error Feedback**: Send error message to LLM:
   ```
   Error executing tool '{tool_name}': {error_message}
   
   You have {remaining_retries} retries remaining. 
   Please try a different approach or ask the user for help.
   ```
3. **Retry Limit**: Max 3 retries per tool execution
4. **Guidance**: LLM can adjust strategy based on error

### Tool Execution Timeouts
When a tool times out (default 60s):

1. **Timeout Detection**: `tokio::time::timeout()` wrapper
2. **Error Feedback**: Send timeout message to LLM:
   ```
   Tool '{tool_name}' timed out after {timeout}s
   
   This tool took too long to execute. 
   Please try a simpler operation or break it into smaller steps.
   ```
3. **Retry Counting**: Timeout counts as execution failure
4. **Loop Continuation**: Check retry limits

### JSON Parsing Failures
When LLM response can't be parsed as JSON:

1. **Parse Attempt**: Try to extract JSON from response
2. **Validation**: Check required fields (`tool`, `parameters`, `terminate`)
3. **Retry Feedback**: Send parse error to LLM:
   ```
   Failed to parse tool call. Please format as JSON:
   {
     "tool": "tool_name",
     "parameters": {},
     "terminate": true/false
   }
   ```
4. **Max Retries**: 3 parse failures before stopping loop
5. **Graceful Degradation**: Return partial response to user

### Max Iterations Exceeded
When loop reaches max iterations (10):

1. **Iteration Check**: `AgentLoopState.iteration < config.max_iterations`
2. **Termination**: Stop loop gracefully
3. **User Message**: Inform user that max iterations reached
4. **Conversation Save**: Save partial progress to session

### Global Timeout
When loop exceeds global timeout (300s / 5 minutes):

1. **Time Check**: `elapsed_time < config.timeout`
2. **Graceful Stop**: Return best available response
3. **User Notification**: Inform user of timeout
4. **Cleanup**: Save state and cleanup resources

## Tool Approval Flow

### Approval Required
Tools with `requires_approval=true` pause the agent loop:

**Examples**:
- `create_file` - Creates new files
- `update_file` - Modifies existing files
- `delete_file` - Deletes files (deprecated, use workflow)
- `execute_command` - Runs shell commands (deprecated, use workflow)

### Approval Process

1. **Tool Call Detection**:
   ```rust
   let tool_definition = tool_executor.get_tool_definition(&tool_name)?;
   if tool_definition.requires_approval {
       // Pause for approval
   }
   ```

2. **Create Approval Request**:
   ```rust
   let request_id = approval_manager
       .create_request(session_id, tool_call, tool_name, tool_description)
       .await?;
   ```

3. **Return to Frontend**:
   ```rust
   ServiceResponse::AwaitingAgentApproval {
       request_id,
       session_id,
       tool_name,
       tool_description,
       parameters,
   }
   ```

4. **User Decision** (Frontend):
   ```typescript
   // User sees approval modal with:
   // - Tool name and description
   // - Parameters to be used
   // - Approve / Reject buttons
   
   POST /v1/chat/{session_id}/approve-agent
   {
     "request_id": "uuid",
     "approved": true/false,
     "reason": "optional rejection reason"
   }
   ```

5. **Continue or Abort**:
   ```rust
   if approved {
       // Execute tool and continue loop
       execute_tool_and_continue()
   } else {
       // Return rejection message to LLM
       send_rejection_feedback_to_llm()
   }
   ```

### Approval UI (Frontend)
**Status**: Pending implementation (Task 4.2.5)

**Planned Features**:
- Modal dialog with tool information
- Parameter preview (formatted JSON)
- Security warnings for dangerous operations
- Approve / Reject buttons
- Optional rejection reason input
- Loading state during execution

## Configuration

### Agent Loop Limits
```rust
AgentLoopConfig {
    max_iterations: 10,                 // Max tool calls per session
    timeout: Duration::from_secs(300),   // 5 minute global timeout
    max_json_parse_retries: 3,          // Max JSON parsing retries
    max_tool_execution_retries: 3,      // Max tool execution retries
    tool_execution_timeout: Duration::from_secs(60), // 1 minute per tool
}
```

### Customization
These limits can be adjusted per use case:
- **Quick interactions**: Lower `max_iterations` (5), shorter `timeout` (60s)
- **Complex tasks**: Higher `max_iterations` (20), longer `timeout` (600s)
- **Production**: Conservative limits to prevent runaway loops
- **Development**: Relaxed limits for experimentation

## Best Practices

### For Tool Developers

1. **Design Atomic Tools**:
   - Single, well-defined purpose
   - Clear success/failure states
   - Predictable execution time

2. **Set Appropriate Approval**:
   - `requires_approval=false` for read operations
   - `requires_approval=true` for write operations
   - Consider impact of autonomous execution

3. **Provide Clear Descriptions**:
   - Tool descriptions guide LLM usage
   - Parameter descriptions improve accuracy
   - Termination behavior docs help LLM decide

4. **Handle Errors Gracefully**:
   - Return structured error messages
   - Include actionable suggestions
   - Avoid exposing system internals

### For LLM (via System Prompt)

1. **Use terminate Flag Correctly**:
   - `false` for information gathering
   - `true` for final actions
   - Consider user intent

2. **Chain Tools Efficiently**:
   - Read before writing
   - Search before reading
   - Validate before executing

3. **Handle Errors Gracefully**:
   - Parse error messages
   - Adjust strategy on failure
   - Ask user for help when stuck

4. **Respect Limits**:
   - Avoid infinite loops
   - Break complex tasks into steps
   - Terminate when goal achieved

### For Frontend Developers

1. **Display Agent Progress**:
   - Show tool calls in progress
   - Display tool results
   - Indicate loop iteration

2. **Handle Approval Requests**:
   - Clear approval UI
   - Parameter preview
   - Security warnings

3. **Handle Long-Running Operations**:
   - Loading states
   - Timeout warnings
   - Cancel/interrupt capability

## Security Considerations

### Tool Access Control
- Tools are only accessible to authenticated users
- Session-based tool execution
- No cross-session tool access

### Approval Gates
- Write operations require approval
- Destructive operations use workflows
- Multiple confirmation layers for dangerous actions

### Timeout Protection
- Individual tool timeout (60s)
- Global loop timeout (300s)
- Prevent resource exhaustion

### Error Feedback Sanitization
- Don't expose system paths
- Don't leak sensitive data
- Generic error messages to LLM

### Tool Classification
- **LLM Tools**: Safe for autonomous use
- **Workflows**: User-explicit control
- Regular security audits

## Monitoring and Observability

### Metrics to Track
- **Agent Loop Duration**: Time per agent loop
- **Tool Call Count**: Number of tools called per session
- **Approval Rate**: Percentage of tools requiring approval
- **Failure Rate**: Tool execution failure percentage
- **Timeout Rate**: Tools timing out
- **Iteration Distribution**: Histogram of loop iterations

### Logging
```rust
// Structured logging at key points
log::info!("Agent loop started", {
    session_id, iteration, tool_name
});

log::warn!("Tool execution failed", {
    session_id, tool_name, error, retry_count
});

log::error!("Agent loop timeout", {
    session_id, elapsed_time, iteration
});
```

### Debugging
- Tool call history in `AgentLoopState`
- Parse failure tracking
- Execution failure tracking
- Comprehensive error context

## Future Enhancements

### Planned Features
1. **Role-Based Tool Access**:
   - Planner role: Read-only tools
   - Actor role: Read + approved write
   - Admin role: All tools

2. **Parallel Tool Execution**:
   - Execute independent tools concurrently
   - Reduce total loop time
   - Handle dependencies

3. **Tool Call Streaming**:
   - Stream tool execution progress to frontend
   - Real-time feedback
   - Cancellation support

4. **Agent Loop Visualization**:
   - Graph of tool calls
   - Execution timeline
   - Success/failure indicators

5. **Advanced Error Recovery**:
   - Automatic retry strategies
   - Fallback tools
   - Partial result recovery

## Related Documentation

- [Tool Classification Analysis](../../TOOL_CLASSIFICATION_ANALYSIS.md) - Tool vs Workflow decisions
- [Workflow System](./WORKFLOW_SYSTEM_ARCHITECTURE.md) - User-invoked workflows
- [System Prompt Enhancement](./SYSTEM_PROMPT_ENHANCEMENT.md) - How tools are injected
- [OpenSpec Proposal](../../openspec/changes/refactor-tools-to-llm-agent-mode/proposal.md) - Original design
- [OpenSpec Design](../../openspec/changes/refactor-tools-to-llm-agent-mode/design.md) - Technical decisions

## API Reference

### Agent Loop Endpoints

#### Start Agent Loop (Implicit)
```http
POST /v1/openai/chat/completions
```
Agent loop starts automatically when LLM returns JSON tool call.

#### Approve Agent Tool Call
```http
POST /v1/chat/{session_id}/approve-agent

Request:
{
  "request_id": "uuid",
  "approved": true,
  "reason": "optional"
}

Response:
{
  "status": "completed" | "awaiting_approval",
  "message": "string"
}
```

## Conclusion

The Agent Loop architecture enables autonomous LLM-driven tool usage while maintaining safety through:
- **Approval gates** for sensitive operations
- **Timeout protection** to prevent runaway loops
- **Retry limits** for graceful failure handling
- **Clear separation** between Tools and Workflows
- **Comprehensive error feedback** to guide LLM

This design balances autonomy with safety, enabling powerful LLM capabilities while keeping users in control of high-risk operations.

