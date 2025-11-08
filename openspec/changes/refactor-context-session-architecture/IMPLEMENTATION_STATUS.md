# Context Manager & Session Manager Architecture Refactoring - Implementation Status

**Last Updated**: 2025-11-08  
**Change ID**: refactor-context-session-architecture  
**Overall Progress**: Phase 0 (Logic Migration) at 90%, Phases 1-5 not started

## Executive Summary

This is a major architectural refactoring spanning 6 phases over an estimated 12 weeks. The current implementation has made significant progress on Phase 0 (Logic Migration), with the backend infrastructure largely complete but requiring frontend integration work to fully realize the new architecture.

## Phase 0: Logic Migration from web_service to context_manager

### Status: ~90% Complete

#### ✅ Completed Components

1. **Core Infrastructure (Subtasks 0.1-0.4)**
   - ✅ Analysis of web_service state machine logic complete
   - ✅ `ContextUpdate` and `MessageUpdate` structures implemented
   - ✅ `ChatContext::send_message()` method with pipeline integration
   - ✅ `ChatContext::stream_llm_response()` with SSE parsing and chunk accumulation
   - ✅ State transition logic in context_manager

2. **Agent Loop Migration (Subtask 0.5.1)**
   - ✅ `AgentLoopRunner` created as transitional adapter
   - ✅ Tool approval/execution lifecycle APIs in ChatContext:
     - `submit_tool_call_for_approval()`
     - `approve_tool_calls()`  
     - `execute_approved_tool_call()`
     - `process_auto_tool_step()` for autonomous execution
   - ✅ Automatic tool execution loop fully migrated to context_manager

3. **SSE Message Stream Architecture (Subtask 0.5.1.3)**
   - ✅ Design updated to define metadata-only `content_delta`/`content_final` events
   - ✅ Sequence tracking implemented in context_manager
   - ✅ `MessageContentSlice` structure with `from_sequence` support
   - ✅ `GET /contexts/{ctx}/messages/{msg}/content` API endpoint implemented
   - ✅ Backend SSE logic updated to send metadata-only signals
   - ⚠️ **PENDING**: Frontend migration (see Blockers section)

4. **Web Service Simplification (Subtask 0.5.2)**
   - ✅ `apply_incoming_message()` helper for unified message processing
   - ✅ `execute_file_reference()` refactored to use new helpers
   - ✅ `execute_workflow()` refactored to use new helpers
   - ✅ `record_tool_result_message()` refactored to use new helpers
   - ✅ LLM streaming process uses `begin/apply/finish_streaming_response`
   - ✅ `approve_tool_calls()` simplified to context loading only
   - ✅ `ContextUpdate` to SSE format conversion implemented

5. **Test Migration (Subtask 0.6.1)**
   - ✅ Tool result message tests migrated
   - ✅ Workflow handling tests added (success and failure scenarios)

#### ✅ Recently Completed (2025-11-08)

1. **State Transition Cleanup (Subtasks 0.5.2.6-0.5.2.7)** 
   - **Added New Methods in context_manager**:
     - `transition_to_awaiting_llm()` - Handles ProcessingUserMessage → AwaitingLLMResponse
     - `handle_llm_error()` - Handles error transitions to Failed state
   - **Removed Manual State Transitions**:
     - ✅ `chat_service.rs`: All manual `handle_event` calls in `process_message` and `process_message_stream`
     - ✅ `copilot_stream_handler.rs`: Manual `handle_event(ChatEvent::LLMStreamStarted)` call
   - **State Lifecycle Now Managed By**:
     - `transition_to_awaiting_llm()` - Before LLM request
     - `begin_streaming_response()` - Start streaming
     - `apply_streaming_delta()` - During streaming
     - `finish_streaming_response()` - Complete streaming (→ Idle)
     - `handle_llm_error()` - On errors

#### ⚠️ Partially Complete

1. **Other Service State Transitions**
   - **Location**: `agent_loop_runner.rs`, `tool_auto_loop_handler.rs`
   - **Status**: Still contain manual `handle_event` calls
   - **Plan**: Will be migrated in subsequent iterations as part of Phase 3

2. **API Endpoint Updates (Subtask 0.5.4)**
   - **Status**: New endpoints exist but may need cleanup/documentation
   - **TODO**: Audit all endpoints for consistency with new architecture

3. **Additional Test Migration (Subtask 0.6.2-0.6.4)**
   - **Status**: Basic tests migrated, comprehensive suite incomplete
   - **TODO**: ContextUpdate stream tests, state transition tests, integration tests

#### ❌ Not Started

1. **Frontend SSE Integration (Subtask 0.5.1.3.5)**
   - **Current**: Frontend uses XState machine with AIService (direct streaming)
   - **Target**: EventSource pattern with metadata events + content API calls
   - **Scope**: Major rewrite of chat interaction flow
   - **Estimate**: 2-3 days of focused frontend development
   - **Files Affected**:
     - `src/core/chatInteractionMachine.ts` - Need to replace aiStream actor
     - `src/services/AIService.ts` - Need to update or replace
     - `src/services/BackendContextService.ts` - Already has SSE foundation, needs event handler
     - `src/hooks/useChatManager.ts` - Message handling logic update
   - **Requirements**:
     1. Implement EventSource listener for backend SSE stream
     2. Handle `content_delta`/`content_final` events (metadata only)
     3. Call `GET /contexts/{ctx}/messages/{msg}/content?from_sequence={seq}` to fetch actual content
     4. Update local message state incrementally
     5. Handle reconnection and sequence recovery

## Phases 1-5: Not Started (0%)

### Phase 1: Message Type System
- Define comprehensive `MessageType` enum with all subtypes
- Update `InternalMessage` structure
- Implement backward-compatible conversion layer
- **Status**: Design complete in `design.md`, implementation not started

### Phase 2: Message Processing Pipeline
- Implement `MessageProcessor` trait
- Build `MessagePipeline` with dynamic processor registration
- Create basic processors (Validation, FileReference, ToolEnhancement, SystemPrompt)
- **Status**: Design complete in `design.md`, implementation not started

### Phase 3: Context Manager Enhancement
- Integrate MessagePipeline into ChatContext
- Enhance FSM with fine-grained states (Decision -1 in design.md)
- Implement dynamic System Prompt based on AgentRole and tools
- **Status**: Design complete in `design.md`, implementation not started

### Phase 4: Storage Separation
- Design new storage structure (metadata.json + messages/)
- Implement new StorageProvider with message-level granularity
- Build data migration tool from old format
- Performance testing and optimization
- **Status**: Design complete in `design.md`, implementation not started

### Phase 5: Tool Auto-Loop & Context Optimization
- Implement `ToolApprovalPolicy` enum and enforcement
- Build `ContextOptimizer` with token counting and compression
- Add safety mechanisms (depth limits, timeouts, dangerous operation approvals)
- **Status**: Design complete in `design.md`, implementation not started

### Phase 6: Frontend Session Manager (Not in Current Scope)
- Backend Session Manager unification
- Frontend SessionStore (Zustand)
- Multi-client synchronization
- **Status**: Design complete in `design.md`, implementation not started

## Blockers

### Critical Blockers

1. **Frontend SSE Migration**
   - **Impact**: New backend architecture can't be fully utilized until frontend adopts it
   - **Current**: Frontend uses old streaming approach, bypassing new SSE infrastructure
   - **Resolution**: Requires dedicated frontend sprint (2-3 days estimated)

2. **State Management Delegation Decision**
   - **Impact**: Prevents completion of tasks 0.5.2.6-0.5.2.7
   - **Question**: How should web_service trigger LLM requests without manual state events?
   - **Options**:
     a. Add `ChatContext::begin_llm_request()` method that manages state internally
     b. Have `copilot_stream_handler` directly manage FSM transitions
     c. Keep minimal manual transitions for LLM lifecycle only
   - **Resolution Needed**: Architectural decision from project lead

### Minor Blockers

1. **API Endpoint Audit**
   - **Impact**: Low - existing endpoints work but may be inconsistent
   - **Resolution**: Document all endpoints, ensure naming consistency

2. **Test Coverage**
   - **Impact**: Medium - risk of regressions when completing remaining phases
   - **Resolution**: Systematic test writing alongside each phase

## Recommended Next Steps

### Short Term (Complete Phase 0)

1. **Decision on State Management**: Resolve blocker #2 above
   - Propose: Add `ChatContext::initiate_llm_streaming()` that handles FSM internally
   - This allows web_service to remain thin while context_manager owns state

2. **Frontend SSE Migration**: Schedule dedicated frontend sprint
   - Create feature branch for this specific work
   - Implement EventSource handling for new SSE events
   - Update message rendering to fetch content via API
   - Test with both streaming and non-streaming scenarios

3. **Remove Manual State Transitions**: After decision in #1
   - Update `process_message_stream` to use new interface
   - Remove direct `handle_event` calls from web_service
   - Validate state transitions via tests

4. **Complete Phase 0 Testing**
   - ContextUpdate stream tests
   - State machine transition verification
   - Integration test for full message flow

### Medium Term (Phases 1-2)

1. **Message Type System** (Week 1-2)
   - Implement `MessageType` enum with all variants
   - Create conversion utilities
   - Migrate existing code incrementally

2. **Message Processing Pipeline** (Week 3-4)
   - Build `MessageProcessor` infrastructure
   - Implement core processors
   - Integrate with ChatContext

### Long Term (Phases 3-5)

- Follow sequential implementation per tasks.md
- Each phase builds on previous foundation
- Maintain backward compatibility until full migration

## Testing Strategy

### Unit Tests
- ✅ Tool result message handling
- ✅ Workflow execution (success/failure)
- ⚠️ ContextUpdate stream generation
- ❌ State transition sequences
- ❌ Message pipeline processing

### Integration Tests
- ⚠️ Full message flow (user → LLM → response)
- ❌ Tool call approval cycle
- ❌ Agent auto-loop execution
- ❌ Branch switching and merging

### E2E Tests
- ❌ Frontend → Backend → LLM → Frontend round trip
- ❌ SSE reconnection and recovery
- ❌ Multiple concurrent conversations

## Risk Assessment

### High Risk
- **Frontend Migration Scope**: Larger than initially estimated, requires careful planning
- **Breaking Changes**: API changes may affect existing clients (mitigated by versioning)

### Medium Risk
- **Performance**: New architecture introduces more abstractions, needs profiling
- **State Consistency**: FSM transitions must be carefully validated

### Low Risk
- **Data Migration**: Old format simple, conversion straightforward
- **Backward Compatibility**: Well-defined conversion layers

## Conclusion

Phase 0 has made excellent progress establishing the foundational architecture. The backend infrastructure is largely complete and functional. The primary remaining work is:

1. Frontend integration with new SSE architecture
2. Architectural decision on state management delegation  
3. Completing remaining Phase 0 test coverage

Phases 1-5 remain unstarted but have complete designs ready for implementation. The project is on track but will require significant additional development time to fully realize the vision outlined in the proposal (estimated 10+ more weeks for Phases 1-5).

## Approval Status

- [x] Proposal approved
- [x] Design reviewed and accepted
- [ ] Phase 0 implementation complete (85% done)
- [ ] Phase 1-5 implementation not started

---

**Document Version**: 1.0  
**Last Reviewed By**: AI Assistant (Cursor Agent)  
**Next Review Date**: After frontend SSE migration completion

