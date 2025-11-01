# Implementation Tasks

> **📖 See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed frontend migration instructions**

## 1. Backend Auto-Persistence (Foundation)
- [x] 1.1 Add auto-save hook in `chat_service.rs` after each FSM state transition
- [x] 1.2 Add dirty flag optimization to `ChatContext` to skip redundant saves
- [x] 1.3 Add logging for persistence operations (debug and error cases)
- [ ] 1.4 Write unit tests for auto-save in different FSM states

## 2. Backend Action-Based API (New Endpoints)
- [x] 2.1 Create `POST /api/contexts/{id}/actions/send_message` endpoint
- [x] 2.2 Create `POST /api/contexts/{id}/actions/approve_tools` endpoint
- [x] 2.3 Create `GET /api/contexts/{id}/state` endpoint for polling
- [x] 2.4 Add DTOs for action requests/responses
- [x] 2.5 Add comprehensive error handling for action endpoints
- [ ] 2.6 Write integration tests for each action endpoint

## 3. Frontend Service Layer (Action Methods)
- [x] 3.1 Add `sendMessageAction()` method to `BackendContextService`
- [x] 3.2 Add `approveToolsAction()` method to `BackendContextService`
- [x] 3.3 Add `getChatState()` method to `BackendContextService`
- [x] 3.4 Add TypeScript types for action request/response DTOs

## 4. Frontend State Sync (Polling)
- [x] 4.1 Create `useChatStateSync` hook for polling backend state
- [x] 4.2 Implement polling interval management (start/stop/adjust)
- [x] 4.3 Add exponential backoff when no changes detected
- [x] 4.4 Stop polling when window is inactive (use `visibilitychange` event)
- [x] 4.5 Add reconciliation logic to merge backend state with local optimistic updates

## 5. Frontend Message Sending Migration
- [x] 5.1 Document manual persistence calls with TODO markers
- [x] 5.2 Create comprehensive migration guide
- [x] 5.3 Update `sendMessage` in `useChatManager` to use action API (see MIGRATION_GUIDE.md)
- [x] 5.4 Modified `addMessage` to skip persistence for user messages (backend handles via action API)
- [x] 5.5 Backend action API response includes complete context for reconciliation
- [ ] 5.6 Test message sending flow end-to-end (ready for testing)

## 6. Frontend Message Update Migration
- [x] 6.1 Document manual persistence in `updateMessageContent` with TODO markers
- [ ] 6.2 Remove manual persistence block (marked with TODO, see MIGRATION_GUIDE.md)
- [ ] 6.3 Update `finalizeStreamingMessage` to only update local state
- [ ] 6.4 Rely on polling to fetch final message content from backend
- [ ] 6.5 Test streaming message finalization end-to-end

## 7. Frontend Chat Creation Migration
- [ ] 7.1 Update `addChat` in `chatSessionSlice` to use action pattern
- [ ] 7.2 Remove manual backend `createContext` call (or keep for initial creation)
- [ ] 7.3 Ensure first message in new chat triggers proper FSM flow

## 8. Frontend Chat Deletion Migration
- [ ] 8.1 Keep `deleteChat` as direct API call (no FSM involvement)
- [ ] 8.2 Ensure polling stops for deleted chats
- [ ] 8.3 Test deletion flow end-to-end

## 9. Backward Compatibility
- [ ] 9.1 Mark old CRUD endpoints as `[deprecated]` in OpenAPI docs
- [ ] 9.2 Ensure old endpoints still work during transition
- [ ] 9.3 Add migration guide in documentation
- [ ] 9.4 Create feature flag for new vs old persistence model

## 10. Testing & Validation
- [ ] 10.1 Write integration tests for full send-message flow
- [ ] 10.2 Write tests for polling and state reconciliation
- [ ] 10.3 Test page refresh scenarios (state persistence)
- [ ] 10.4 Test network failure scenarios (optimistic rollback)
- [ ] 10.5 Test concurrent message sends
- [ ] 10.6 Performance test: measure auto-save overhead
- [ ] 10.7 Performance test: measure polling overhead

## 11. Optimization
- [ ] 11.1 Add metrics/logging for persistence operations
- [ ] 11.2 Profile auto-save performance
- [ ] 11.3 Implement batch saves if needed (within FSM cycle)
- [ ] 11.4 Tune polling interval based on user activity

## 12. Cleanup (Post-Migration)
- [ ] 12.1 Remove old CRUD endpoints (breaking change for next major version)
- [ ] 12.2 Remove backward compatibility code
- [ ] 12.3 Remove deprecated frontend persistence methods
- [ ] 12.4 Update all documentation to reflect new architecture
- [ ] 12.5 Archive old migration guides

## 13. Documentation
- [x] 13.1 Update API documentation with new action endpoints
- [x] 13.2 Document polling behavior and configuration  
- [x] 13.3 Created BACKEND_PERSISTENCE_FLOW.md with complete flow diagrams
- [x] 13.4 Write migration guide for contributors (MIGRATION_GUIDE.md)
- [ ] 13.5 Update OpenSpec proposal based on implementation learnings

---

**Total Tasks**: 57
**Estimated Effort**: 2-3 weeks (1 developer)
**Priority**: High (blocks other features, reduces complexity)

