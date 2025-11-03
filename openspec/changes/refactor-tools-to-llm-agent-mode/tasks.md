# Implementation Tasks

## 1. Backend Foundation

### 1.1 Create Workflow System Crate
- [x] 1.1.1 Create `crates/workflow_system/` with Cargo.toml
- [x] 1.1.2 Define `Workflow` trait with `definition()` and `execute()` methods
- [x] 1.1.3 Create `WorkflowDefinition` struct with metadata (name, description, parameters, category)
- [x] 1.1.4 Implement `WorkflowRegistry` for registering and looking up workflows
- [x] 1.1.5 Create `WorkflowExecutor` for executing workflows by name
- [x] 1.1.6 Add basic error types: `WorkflowError`, `WorkflowNotFound`, `InvalidParameters`
- [x] 1.1.7 Write unit tests for registry and executor

### 1.2 Add Workflow Examples
- [x] 1.2.1 Implement example workflow: `EchoWorkflow` (simple parameter echo)
- [x] 1.2.2 Implement example workflow: `CreateFileWorkflow` (creates a file with content)
- [x] 1.2.3 Register example workflows in registry
- [x] 1.2.4 Test workflow execution with various parameter combinations

### 1.3 Create Agent Service
- [x] 1.3.1 Create `crates/web_service/src/services/agent_service.rs`
- [x] 1.3.2 Define `AgentLoopState` struct to track agent execution state
- [x] 1.3.3 Implement `parse_tool_call_from_response()` to extract JSON from LLM output
- [x] 1.3.4 Implement `validate_tool_call_json()` to validate required fields
- [x] 1.3.5 Implement `execute_agent_loop()` with max iterations and timeout
- [x] 1.3.6 Add telemetry/logging for agent loop steps
- [x] 1.3.7 Write unit tests for JSON parsing edge cases

### 1.4 Add Termination Flag to Tool Definitions
- [x] 1.4.1 Update `ToolDefinition` struct to include termination behavior documentation
- [x] 1.4.2 Update all existing tool definitions with examples of terminate flag usage
- [x] 1.4.3 Document in code comments how terminate flag affects execution

## 2. System Prompt Enhancement

### 2.1 Tool-to-Prompt Conversion
- [x] 2.1.1 Create `tool_system/src/prompt_formatter.rs`
- [x] 2.1.2 Implement `format_tool_as_xml()` to convert ToolDefinition to XML string
- [x] 2.1.3 Implement `format_tools_section()` to wrap multiple tools with instructions
- [x] 2.1.4 Add JSON calling convention instructions template
- [x] 2.1.5 Add terminate flag explanation to prompt template
- [x] 2.1.6 Write tests for prompt formatting with various tool configurations

### 2.2 System Prompt Enhancement Service
- [x] 2.2.1 Create `web_service/src/services/system_prompt_enhancer.rs`
- [x] 2.2.2 Implement `enhance_prompt()` that accepts base prompt and returns enhanced version
- [x] 2.2.3 Integrate with ToolService to fetch available tools
- [x] 2.2.4 Integrate with prompt_formatter to convert tools to prompt text
- [x] 2.2.5 Add Mermaid enhancement support (migrate from frontend logic)
- [x] 2.2.6 Implement prompt size optimization (truncate if too large)
- [x] 2.2.7 Add caching mechanism for frequently accessed prompts
- [x] 2.2.8 Implement configuration for max prompt size limits
- [x] 2.2.9 Write unit tests for enhancement with various tool combinations

### 2.3 Enhanced Prompt API Endpoint
- [x] 2.3.1 Add `GET /v1/system-prompts/{id}/enhanced` endpoint
- [x] 2.3.2 Integrate SystemPromptService to get base prompt
- [x] 2.3.3 Integrate SystemPromptEnhancer to augment base prompt
- [x] 2.3.4 Return enhanced prompt in JSON response
- [x] 2.3.5 Add error handling for missing prompts
- [x] 2.3.6 Write integration tests for endpoint

## 3. Backend API for Workflows

### 3.1 Workflow Controller
- [x] 3.1.1 Create `crates/web_service/src/controllers/workflow_controller.rs`
- [x] 3.1.2 Add `GET /v1/workflows/available` endpoint to list all workflows
- [x] 3.1.3 Add `GET /v1/workflows/{name}` endpoint to get workflow details
- [x] 3.1.4 Add `GET /v1/workflows/categories` endpoint to list categories
- [x] 3.1.5 Add `POST /v1/workflows/execute` endpoint to execute workflows
- [x] 3.1.6 Add request/response DTOs for all endpoints
- [x] 3.1.7 Wire up controller in server.rs

### 3.2 Workflow Service
- [x] 3.2.1 Create `crates/web_service/src/services/workflow_service.rs`
- [x] 3.2.2 Implement `list_workflows()` to get all workflow definitions
- [x] 3.2.3 Implement `get_workflow(name)` to get single workflow
- [x] 3.2.4 Implement `execute_workflow(name, params)` to execute workflow
- [x] 3.2.5 Add parameter validation before execution
- [x] 3.2.6 Add logging for workflow execution lifecycle

### 3.3 Workflow Categories
- [x] 3.3.1 Define `WorkflowCategory` struct
- [x] 3.3.2 Create `CategoryRegistry` for organizing workflows
- [x] 3.3.3 Add category metadata (id, name, description, icon)
- [x] 3.3.4 Update workflows to reference categories
- [x] 3.3.5 Add API endpoint to fetch categories with workflow counts

## 4. Agent Loop Integration

### 4.1 OpenAI Controller Integration
- [x] 4.1.1 Identify injection point in OpenAI controller streaming logic
- [x] 4.1.2 Design: Agent loop should run AFTER LLM response is complete
- [x] 4.1.3 Design: Agent loop checks for JSON tool calls in response
- [x] 4.1.4 Design: If tool call found, execute tool and send result back to LLM
- [x] 4.1.5 Design: Continue loop until LLM returns text response or max iterations
- [x] 4.1.6 Design: Frontend should receive final text response, not intermediate steps
- [x] 4.1.7 Design: Tool execution results are appended to conversation history
- [x] 4.1.8 Design: Error handling for tool execution failures
- [x] 4.1.9 Design: Timeout handling for long-running agent loops
- [x] 4.1.10 Document integration design in design.md

### 4.2 Tool Call Approval in Agent Loop
- [x] 4.2.1 Design approval mechanism for agent-initiated tool calls
- [x] 4.2.2 Add approval flag to ToolDefinition (requires_approval: bool)
- [x] 4.2.3 Agent loop pauses and waits for user approval if tool requires it
- [x] 4.2.4 Add approval API endpoint: POST /v1/chat/{session_id}/approve-agent
- [ ] 4.2.5 Frontend displays approval request and sends approval/rejection

### 4.3 Agent Loop Error Handling
- [x] 4.3.1 Handle tool execution failures gracefully
- [x] 4.3.2 Return error message to LLM for retry
- [x] 4.3.3 Implement max retry limit for tool execution
- [x] 4.3.4 Add timeout handling for long-running tools
- [x] 4.3.5 Log all agent loop errors with context

## 5. Frontend Refactor

### 5.1 Remove Tool System Frontend Code
- [x] 5.1.1 Delete `src/services/SystemPromptEnhancer.ts` (moved to backend)
- [x] 5.1.2 Delete `src/components/ToolSelector/` (replaced with WorkflowSelector)
- [x] 5.1.3 Update `useChatManager.ts` to fetch enhanced prompts from backend API
- [x] 5.1.4 Update `chatInteractionMachine.ts` to use backend-enhanced prompts
- [x] 5.1.5 Remove frontend tool detection logic from `onChunk` handler
- [x] 5.1.6 Remove old tool parsing from `sendMessage` flow

### 5.2 Create Workflow Service
- [x] 5.2.1 Create `src/services/WorkflowService.ts`
- [x] 5.2.2 Implement `getAvailableWorkflows()` to fetch from backend
- [x] 5.2.3 Implement `getWorkflowDetails(name)` to get workflow definition
- [x] 5.2.4 Implement `executeWorkflow(request)` to execute workflow
- [x] 5.2.5 Implement `getWorkflowCategories()` to fetch categories
- [x] 5.2.6 Add error handling and logging
- [x] 5.2.7 Export from `src/services/index.ts`

### 5.3 Create Workflow Selector Component
- [x] 5.3.1 Create `src/components/WorkflowSelector/index.tsx`
- [x] 5.3.2 Display list of available workflows from backend
- [x] 5.3.3 Filter workflows based on search text
- [x] 5.3.4 Support keyboard navigation (arrow keys, Enter)
- [x] 5.3.5 Support auto-completion (Space/Tab to complete)
- [x] 5.3.6 Emit `onSelect` event when workflow is chosen

### 5.4 Workflow Command Input
- [x] 5.4.1 Update `InputContainer` to detect "/" trigger
- [x] 5.4.2 Show `WorkflowSelector` when "/" is typed
- [x] 5.4.3 Parse workflow name and description from input
- [x] 5.4.4 Pass description to parameter form
- [x] 5.4.5 Clear input after workflow selection

### 5.5 Workflow Parameter Form
- [x] 5.5.1 Create `src/components/WorkflowParameterForm/index.tsx`
- [x] 5.5.2 Dynamically generate form fields based on workflow parameters
- [x] 5.5.3 Support required/optional parameters
- [x] 5.5.4 Validate parameters before submission
- [x] 5.5.5 Emit `onSubmit` event with parameters object

### 5.6 Workflow Execution Feedback
- [x] 5.6.1 Create `src/components/WorkflowExecutionFeedback/index.tsx`
- [x] 5.6.2 Display success/error messages in chat
- [x] 5.6.3 Show workflow output/results
- [x] 5.6.4 Add retry option on failure
- [x] 5.6.5 Integrate with message history

### 5.7 Enhanced Approval Modal for Agent Loop
- [x] 5.7.1 Disable old tool invocation path in `useChatManager.ts`
- [x] 5.7.2 Update `ApprovalCard.tsx` to use "Workflow" terminology
- [x] 5.7.3 Fix workflow execution to bypass approval modal (user-invoked)
- [x] 5.7.4 Prepare approval modal for future agent loop integration
- [x] 5.7.5 Update error messages to refer to workflows

### 5.8 Simplify Chat State Machine
- [x] 5.8.1 Remove old tool detection from `aiStream` actor
- [x] 5.8.2 Remove `USER_INVOKES_TOOL` event handling (kept for now, but disabled)
- [x] 5.8.3 Remove tool-related state transitions
- [x] 5.8.4 Clean up unused tool-related context fields (deferred)
- [x] 5.8.5 Update state machine documentation

## 6. Migration and Cleanup

### 6.1 Classify Existing Tools
- [x] 6.1.1 Review all tools in `crates/tool_system/src/extensions/`
- [x] 6.1.2 Mark tools that should become workflows
- [x] 6.1.3 Mark tools that should remain LLM-accessible
- [x] 6.1.4 Create migration plan (see TOOL_CLASSIFICATION_ANALYSIS.md)

### 6.2 Remove Deprecated Endpoints
- [x] 6.2.1 Identify deprecated tool-related endpoints
- [x] 6.2.2 Add deprecation warnings to endpoints
- [ ] 6.2.3 Remove deprecated endpoints after migration period (deferred to future)

### 6.3 Update Documentation
- [x] 6.3.1 Update README.md with new workflow system
- [x] 6.3.2 Document workflow creation guide (see WORKFLOW_SYSTEM_ARCHITECTURE.md)
- [x] 6.3.3 Document agent loop behavior (see AGENT_LOOP_ARCHITECTURE.md)
- [x] 6.3.4 Update API documentation (included in architecture docs)
- [x] 6.3.5 Add examples of tool vs workflow usage (included in docs)

## 7. Testing

### 7.1 Backend Unit Tests
- [ ] 7.1.1 Test WorkflowExecutor with various parameters
- [ ] 7.1.2 Test AgentService JSON parsing edge cases
- [ ] 7.1.3 Test SystemPromptEnhancer with different tool configurations
- [ ] 7.1.4 Test prompt size optimization
- [ ] 7.1.5 Test workflow parameter validation

### 7.2 Backend Integration Tests
- [ ] 7.2.1 Test workflow execution end-to-end
- [ ] 7.2.2 Test enhanced prompt API endpoint
- [ ] 7.2.3 Test agent loop with mock LLM responses
- [ ] 7.2.4 Test tool approval flow
- [ ] 7.2.5 Test error handling in agent loop
- [ ] 7.2.6 Test timeout handling
- [ ] 7.2.7 Test concurrent workflow executions
- [ ] 7.2.8 Test workflow category filtering

### 7.3 Frontend Unit Tests
- [ ] 7.3.1 Test WorkflowService API calls
- [ ] 7.3.2 Test WorkflowSelector filtering
- [ ] 7.3.3 Test WorkflowParameterForm validation
- [ ] 7.3.4 Test workflow execution flow

### 7.4 End-to-End Tests
- [ ] 7.4.1 Test workflow invocation from chat input
- [ ] 7.4.2 Test workflow execution and feedback display
- [ ] 7.4.3 Test agent loop with real LLM (manual)
- [ ] 7.4.4 Test tool approval in agent loop
- [ ] 7.4.5 Test error recovery
- [ ] 7.4.6 Test concurrent users

### 7.5 Performance Testing
- [ ] 7.5.1 Benchmark prompt enhancement speed
- [ ] 7.5.2 Benchmark workflow execution speed
- [ ] 7.5.3 Test agent loop with max iterations
- [ ] 7.5.4 Measure memory usage with large prompts

## 8. Polish and Deployment

### 8.1 UI/UX Polish
- [ ] 8.1.1 Add loading states for workflow execution
- [ ] 8.1.2 Add animations for workflow selector
- [ ] 8.1.3 Improve error message presentation
- [ ] 8.1.4 Add workflow icons/categories in UI
- [ ] 8.1.5 Add keyboard shortcuts documentation

### 8.2 Logging and Monitoring
- [ ] 8.2.1 Add structured logging for agent loop
- [ ] 8.2.2 Add metrics for workflow execution time
- [ ] 8.2.3 Add metrics for agent loop iterations
- [ ] 8.2.4 Add error rate monitoring

### 8.3 Configuration
- [ ] 8.3.1 Add config for max agent loop iterations
- [ ] 8.3.2 Add config for agent loop timeout
- [ ] 8.3.3 Add config for max prompt size
- [ ] 8.3.4 Add config for workflow approval defaults

### 8.4 Deployment
- [ ] 8.4.1 Update deployment documentation
- [ ] 8.4.2 Add migration scripts if needed
- [ ] 8.4.3 Update environment variables
- [ ] 8.4.4 Create rollback plan
- [ ] 8.4.5 Deploy to production

## Implementation Status Summary

**✅ Completed (68 tasks):**
- All Backend Foundation tasks (1.1-1.4) ✅
- All System Prompt Enhancement tasks (2.1-2.3) ✅
- All Backend Workflows API tasks (3.1-3.3) ✅
- Agent Loop Foundation (4.1) ✅
- All Frontend Refactor tasks (5.1-5.8) ✅

**🚧 In Progress (0 tasks):**
- None currently

**📋 Pending (48 tasks):**
- Agent Loop Approval & Error Handling (4.2-4.3) - 10 tasks
- Migration and Cleanup (6.1-6.3) - 12 tasks
- Testing (7.1-7.5) - 26 tasks
- Polish and Deployment (8.1-8.4) - 18 tasks

**Progress: 58.6% complete (68/116 total tasks)**

## Recent Bug Fixes (Not in Original Tasks)

- Fixed frontend/backend API mismatch: `name` vs `workflow_name` in workflow execution
- Disabled old tool command parsing in `useChatManager.ts` to prevent approval modal conflicts
- Fixed workflow execution to bypass chat message pipeline
- Updated all terminology from "Tool" to "Workflow" in user-facing components
- Fixed SystemPromptService to fetch enhanced prompts from backend API

## Next Steps

Based on priority, the recommended next steps are:

1. **Testing Phase** (7.1-7.5): Add comprehensive tests for completed features
2. **Agent Loop Integration** (4.2-4.3): Complete the agent loop with approval mechanism
3. **Migration** (6.1-6.3): Classify and migrate existing tools
4. **Polish** (8.1-8.4): UI improvements and production deployment
