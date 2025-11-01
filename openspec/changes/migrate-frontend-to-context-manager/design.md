## Context

The project currently has a dual-context management system:
1. **Backend**: Context Manager crate (`context_manager`) with robust FSM, branch support, and efficient message pooling
2. **Frontend**: Custom chat state management using Zustand, XState for FSM, and LocalStorage for persistence

This architectural divergence creates several problems:
- State synchronization issues between frontend and backend
- Duplicated business logic across two implementations
- Frontend cannot leverage advanced features like multi-branch conversations
- LocalStorage limitations (size, performance, persistence)
- Inconsistent tool call metadata handling

The Context Manager already provides a solid foundation with proper separation of concerns, performance optimizations (message pool with O(1) lookups), and explicit state management.

## Goals

1. Establish Context Manager as the single source of truth for all chat state
2. Move context management logic from frontend to backend
3. Simplify frontend to focus on presentation and user interaction
4. Enable multi-branch conversation support
5. Provide clean API boundaries for frontend-backend communication
6. Migrate existing LocalStorage data without data loss

## Non-Goals

- Changing the UI/UX of the chat interface (this is a backend migration)
- Implementing real-time collaboration features
- Adding new conversation features beyond what Context Manager already supports
- Changing the Tauri application structure

## Decisions

### Decision: System Prompt Management in Backend
**What**: Move system prompt CRUD from frontend LocalStorage to backend Context Manager
**Why**: 
- Context Manager already has `Branch.system_prompt` field
- Enables system prompts to be shared across contexts
- Better versioning and management
- Consistent with backend-as-source-of-truth principle
**Alternatives**: Keep prompts in frontend, use a separate prompt service
**Trade-offs**: Adds API calls for prompt management but provides better data consistency

### Decision: DTO Adapter Layer
**What**: Create adapter layer between Context Manager structures and frontend types
**Why**:
- Context Manager uses Rust types optimized for backend
- Frontend needs TypeScript-friendly structures
- Allows independent evolution of both sides
- Protects against breaking changes
**Alternatives**: Direct serialization, code generation from Rust types
**Trade-offs**: Slight overhead but provides decoupling and flexibility

### Decision: Backend FSM, Frontend Reactivity
**What**: Remove frontend XState machine, rely on backend ContextState
**Why**:
- Eliminates duplicate state machines
- Backend FSM is the authoritative state
- Frontend just reacts to state changes via API
- Simpler frontend logic
**Alternatives**: Keep both machines synchronized, frontend-only FSM
**Trade-offs**: More API calls but better consistency and simpler code

### Decision: Gradual Migration with Compatibility Layer
**What**: Provide migration utility to convert old LocalStorage data to backend contexts
**Why**:
- Prevents data loss for existing users
- Allows phased rollout
- Can run migration in background on first launch
**Alternatives**: Force reset, manual import
**Trade-offs**: Migration complexity but ensures smooth user experience

### Decision: StorageService for UI Preferences Only
**What**: Restrict LocalStorage to UI preferences, remove all chat data
**Why**:
- Clear separation of concerns
- Backend handles persistent data
- Frontend handles transient UI state
- Reduces LocalStorage size
**Alternatives**: Keep some chat metadata cached locally, remove all local storage
**Trade-offs**: Requires network for chat data but cleaner architecture

## Risks / Trade-offs

### Risk: Network Dependency
**Mitigation**: Implement offline queue for actions, cache recent contexts locally
**Trade-offs**: Adds complexity but necessary for local-first feel

### Risk: Migration Data Loss
**Mitigation**: Implement validation checks, provide rollback, extensive testing
**Trade-offs**: Extra development time but essential for user trust

### Risk: Performance Degradation
**Mitigation**: Use LRU cache in backend session manager, batch API calls, optimistic UI updates
**Trade-offs**: May add latency but backend optimizations can offset

### Risk: Breaking Changes in Tool Call Display
**Mitigation**: Maintain adapter compatibility, versioned API endpoints
**Trade-offs**: Temporary backward compatibility needed

## Migration Plan

### Phase 1: Backend Extensions (Foundation)
1. Extend Context Manager with system prompt management
2. Add REST API endpoints for context CRUD
3. Add tool call display metadata to structures
4. Implement DTO adapter layer
5. Add comprehensive tests

### Phase 2: Frontend API Integration
1. Create BackendContextService to replace StorageService
2. Update chat manager hooks to use API calls
3. Remove XState machine, rely on polling/SSE for state updates
4. Update message rendering for new tool call metadata
5. Implement optimistic updates for better UX

### Phase 3: Data Migration
1. Create migration utility for LocalStorage data
2. Implement validation and rollback
3. Test migration with production-like data
4. Add UI for migration process (progress, errors)

### Phase 4: Cleanup
1. Remove deprecated frontend state management code
2. Remove chat-related LocalStorage code
3. Update documentation
4. Conduct end-to-end testing

## Open Questions

1. Should we implement WebSocket/SSE for real-time state updates or rely on polling?
   - **Recommendation**: Start with polling, add SSE later if needed

2. How should we handle offline scenarios during migration?
   - **Recommendation**: Show offline indicator, queue actions, sync when back online

3. What is the retention policy for old LocalStorage data after migration?
   - **Recommendation**: Keep for 30 days as backup, then auto-cleanup

4. Should system prompts be per-user or globally shared?
   - **Recommendation**: Start per-user, design for future sharing if needed

5. How do we handle tool call approvals in the new architecture?
   - **Recommendation**: Backend tracks approval state, frontend displays UI based on state

