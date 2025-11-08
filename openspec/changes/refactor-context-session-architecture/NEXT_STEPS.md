# Next Steps for Context Manager Architecture Refactoring

**Quick Reference Guide for Continuing Development**

## Overview

This OpenSpec change implements a major architectural refactoring over 6 phases (~12 weeks total). **Phase 0 is 85% complete**, with backend infrastructure in place but frontend integration pending.

## Current Status (2025-11-08)

- ✅ Backend SSE architecture implemented
- ✅ Message content API with sequence tracking
- ✅ Agent loop migrated to context_manager  
- ✅ Most web_service simplification complete
- ⚠️ Frontend SSE integration not started (CRITICAL BLOCKER)
- ⚠️ Some manual state transitions remain in chat_service.rs

**See `IMPLEMENTATION_STATUS.md` for detailed status report.**

## Critical Path to Complete Phase 0

### 1. Frontend SSE Migration (HIGH PRIORITY - 2-3 days)

**Why Critical**: Backend sends metadata-only SSE events, but frontend still uses old direct streaming approach. New architecture is not being utilized.

**What to Do**:
1. **Create feature branch**: `feature/frontend-sse-migration`
2. **Update `BackendContextService.ts`**:
   - Add EventSource connection for `/contexts/{id}/stream`
   - Handle `content_delta` and `content_final` events (metadata only)
   - Call `GET /contexts/{id}/messages/{msg}/content?from_sequence={seq}` to fetch content
3. **Modify `chatInteractionMachine.ts`**:
   - Replace `aiStream` actor with EventSource-based streaming
   - Update state management to use backend SSE events
4. **Update message rendering**:
   - Fetch content incrementally via API
   - Handle sequence numbers for resume/recovery
5. **Test thoroughly**:
   - Streaming messages
   - Tool call approval flow
   - Reconnection scenarios

**Files to Modify**:
```
src/services/BackendContextService.ts  (lines 280-379, sendMessageStream method)
src/core/chatInteractionMachine.ts     (lines 114-150, aiStream actor)
src/hooks/useChatManager.ts            (message handling logic)
```

**Reference Implementation**: Check backend `copilot_stream_handler.rs` for event format.

### 2. Resolve State Management Delegation (DECISION NEEDED)

**Problem**: `chat_service.rs` still has manual `handle_event()` calls (lines 994-998, 1021-1025).

**Options**:
- **A**: Add `ChatContext::initiate_llm_streaming()` that manages FSM internally ✅ RECOMMENDED
- **B**: Have `copilot_stream_handler` directly manage FSM
- **C**: Keep minimal manual transitions for LLM lifecycle only

**After Decision**:
1. Implement chosen approach
2. Update `process_message_stream()` to use new interface
3. Remove manual `handle_event` calls
4. Add tests for state transitions

### 3. Complete Testing

**Unit Tests Needed**:
- [ ] ContextUpdate stream generation
- [ ] State machine transition sequences  
- [ ] Message pipeline (when Phase 2 starts)

**Integration Tests Needed**:
- [ ] Full message flow (user → LLM → response)
- [ ] Tool call approval cycle
- [ ] Auto-loop execution

**Run Tests**:
```bash
cd crates/context_manager && cargo test
cd crates/web_service && cargo test
```

## Starting Phase 1: Message Type System

**When**: After Phase 0 complete (frontend migration + state management resolved)

**What**: Implement comprehensive `MessageType` enum system as designed in `design.md` Decision 1 and 1.5.

**Steps**:
1. Read `design.md` section "Decision 1: Message Type System (Extended)"
2. Create `crates/context_manager/src/messages/` directory
3. Implement enum and subtypes:
   - `TextMessage`
   - `ImageMessage` (with Vision/OCR modes)
   - `FileRefMessage`
   - `ToolRequestMessage` 
   - `ToolResultMessage`
   - `MCPResourceMessage`
   - `SystemMessage`
4. Update `InternalMessage` to use new `MessageType`
5. Create backward-compatible conversion layer
6. Write comprehensive tests

**Estimate**: 2 weeks

## Quick Commands

### Validate OpenSpec change:
```bash
openspec validate refactor-context-session-architecture --strict
```

### View current tasks:
```bash
cat openspec/changes/refactor-context-session-architecture/tasks.md
```

### Check implementation status:
```bash
cat openspec/changes/refactor-context-session-architecture/IMPLEMENTATION_STATUS.md
```

### Run backend tests:
```bash
cargo test --package context_manager
cargo test --package web_service
```

### View design decisions:
```bash
cat openspec/changes/refactor-context-session-architecture/design.md | less
```

## Key Files to Know

### Backend (Rust)
- **Context Manager Core**: `crates/context_manager/src/structs/context_lifecycle.rs`
- **Message Structures**: `crates/context_manager/src/structs/message.rs`
- **Chat Service**: `crates/web_service/src/services/chat_service.rs`
- **Stream Handler**: `crates/web_service/src/services/copilot_stream_handler.rs`
- **Context Controller**: `crates/web_service/src/controllers/context_controller.rs`

### Frontend (TypeScript)
- **Backend Service**: `src/services/BackendContextService.ts`
- **Chat Machine**: `src/core/chatInteractionMachine.ts`
- **Chat Manager**: `src/hooks/useChatManager.ts`
- **AI Service**: `src/services/AIService.ts`

### Documentation
- **Proposal**: `openspec/changes/refactor-context-session-architecture/proposal.md`
- **Design**: `openspec/changes/refactor-context-session-architecture/design.md`
- **Tasks**: `openspec/changes/refactor-context-session-architecture/tasks.md`
- **Status**: `openspec/changes/refactor-context-session-architecture/IMPLEMENTATION_STATUS.md`

## Common Issues & Solutions

### Issue: Frontend not receiving updated content
**Symptom**: Messages display but don't show AI responses  
**Cause**: Frontend not consuming new SSE events  
**Solution**: Complete frontend SSE migration (step 1 above)

### Issue: State transitions causing errors
**Symptom**: FSM errors in logs  
**Cause**: Manual `handle_event` conflicts with context_manager FSM  
**Solution**: Complete state management delegation (step 2 above)

### Issue: Tests failing after changes
**Symptom**: cargo test errors in context_manager  
**Cause**: API changes not reflected in tests  
**Solution**: Update test mocks and assertions

## Getting Help

1. **Read the design document**: Most architectural decisions are documented with rationale
2. **Check IMPLEMENTATION_STATUS.md**: Detailed status and blockers listed
3. **Review git history**: Recent commits show evolution of architecture
4. **Ask in team channel**: Complex decisions may need discussion

## Timeline Reference

| Phase | Focus | Duration | Status |
|-------|-------|----------|--------|
| 0 | Logic Migration | 2 weeks | 85% ✅ |
| 1 | Message Type System | 2 weeks | Not Started |
| 2 | Message Pipeline | 2 weeks | Not Started |
| 3 | Context Manager Enhancement | 2 weeks | Not Started |
| 4 | Storage Separation | 2 weeks | Not Started |
| 5 | Tool Auto-Loop | 2 weeks | Not Started |

**Total Remaining**: ~10 weeks after Phase 0 completion

---

**Last Updated**: 2025-11-08  
**Maintained By**: Development Team  
**Questions**: See documentation or create OpenSpec discussion

