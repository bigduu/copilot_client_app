# Agent Loop Integration - Implementation Note

## Status: Foundation Complete, Integration Pending

### What's Been Built (Complete):

1. **AgentService** (`agent_service.rs`) ✅
   - JSON tool call parser: `parse_tool_call_from_response()`
   - Tool call validation: `validate_tool_call()`
   - Loop control: `should_continue()` with iteration/timeout limits
   - Error feedback generators for LLM
   - Comprehensive test coverage

2. **SystemPromptEnhancer** ✅
   - Tool injection into prompts
   - Mode detection: `is_passthrough_mode()`
   - Caching with 5-min TTL
   - Size limits and truncation

3. **ToolExecutor** (existing) ✅
   - Tool execution framework
   - Approval mechanism hooks

### Integration Points Needed:

#### 1. OpenAI Controller Integration
The `openai_controller.rs` needs enhancement to:

```rust
// Pseudocode for integration approach:

async fn chat_completions(req) -> Result<HttpResponse> {
    let request_path = req.path(); // Get from actix request
    
    if SystemPromptEnhancer::is_passthrough_mode(request_path) {
        // PASSTHROUGH MODE: Standard OpenAI API
        // Keep existing behavior - forward directly to copilot_client
        return forward_to_copilot_client(req);
    } else {
        // CONTEXT MODE: Enhanced with agent loop
        return handle_context_mode_with_agent_loop(req);
    }
}

async fn handle_context_mode_with_agent_loop(req) -> Result<HttpResponse> {
    // 1. Enhance system prompt with tools
    let enhanced_prompt = enhancer.enhance_prompt(&req.system_prompt).await?;
    
    // 2. Initialize agent state
    let mut agent_state = AgentLoopState::new();
    
    // 3. Agent loop
    loop {
        // 3a. Send to LLM
        let llm_response = copilot_client.send(enhanced_request).await?;
        
        // 3b. Parse for tool calls
        if let Some(tool_call) = agent_service.parse_tool_call(&llm_response)? {
            // 3c. Validate
            agent_service.validate_tool_call(&tool_call)?;
            
            // 3d. Check approval if needed
            if tool_needs_approval(&tool_call.tool) {
                let approved = request_approval(&tool_call).await?;
                if !approved {
                    return error_response("Tool execution rejected");
                }
            }
            
            // 3e. Execute tool
            let tool_result = tool_executor.execute(&tool_call).await?;
            
            // 3f. Check termination
            if tool_call.terminate {
                return Ok(format_final_response(tool_result));
            }
            
            // 3g. Continue loop - append result to chat history
            agent_state.tool_call_history.push(tool_call);
            request.messages.push(tool_result_message);
            
            // 3h. Check loop limits
            if !agent_service.should_continue(&agent_state)? {
                return error_response("Agent loop limit exceeded");
            }
            
            agent_state.iteration += 1;
        } else {
            // No tool call - return LLM response
            return Ok(llm_response);
        }
    }
}
```

#### 2. Required Changes:

**File: `openai_controller.rs`**
- Add path detection (actix `HttpRequest` parameter)
- Add agent_service to function parameters
- Add tool_executor access
- Implement approval request mechanism (WebSocket/SSE)
- Handle streaming with tool call detection

**File: `server.rs`**
- Add AgentService to AppState
- Initialize with default config

**Key Challenges:**
1. **Streaming Support**: Tool call detection in streamed responses requires buffering
2. **Approval Mechanism**: Need async approval request/response channel
3. **State Management**: Agent state needs to be thread-safe for concurrent requests
4. **Error Recovery**: Malformed JSON, tool failures, timeouts need graceful handling

### Why Not Implemented Yet:

The agent loop integration requires:
1. **Approval Infrastructure**: WebSocket/SSE channel for frontend approval requests
2. **Streaming Buffer**: Accumulate streaming chunks to detect JSON tool calls
3. **Request Context**: Access to HTTP request path for mode detection
4. **Complex State**: Thread-safe agent state management across async calls

These are interconnected pieces that need careful coordination with the frontend refactor.

### Recommended Approach:

1. **Phase 1**: Implement non-streaming agent loop first
2. **Phase 2**: Add approval mechanism (requires frontend coordination)
3. **Phase 3**: Add streaming support with buffering
4. **Phase 4**: Comprehensive error handling and recovery

### Current State:

All **building blocks are complete** and tested:
- ✅ Agent service (parsing, validation, loop control)
- ✅ Tool executor (execution framework)
- ✅ System prompt enhancer (tool injection)
- ✅ Workflow system (user-invoked actions)

What remains is **orchestration** - connecting these pieces in the OpenAI controller with proper:
- Request routing (passthrough vs context mode)
- Approval handling (async request/response)
- Streaming support (buffered tool call detection)
- Error recovery (retries, fallbacks, timeouts)

### Testing Strategy:

Once integrated:
1. Unit test: Mode detection
2. Unit test: Tool call parsing from responses
3. Integration test: Single tool call flow
4. Integration test: Multi-step agent loop
5. Integration test: Approval rejection handling
6. Integration test: Timeout/limit enforcement
7. E2E test: Full chat flow with tools

---

**Note**: This represents 30% of total implementation (10/33 tasks). The backend foundation is solid and ready for integration.


