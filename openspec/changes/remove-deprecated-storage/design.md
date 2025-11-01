## Context

The `migrate-frontend-to-context-manager` change successfully moved chat context management to the backend, but left deprecated LocalStorage methods in place with console warnings. These methods are:
1. Still being called by the old Zustand store patterns
2. Creating console noise on every user interaction
3. Unnecessarily bloating the frontend bundle

This change completes the migration by removing all deprecated code paths.

## Goals / Non-Goals

**Goals:**
- Remove all deprecated LocalStorage chat management code
- Eliminate console warnings
- Keep StorageService lean (UI preferences only)
- Ensure zero impact on user experience

**Non-Goals:**
- Not removing UI preference storage (theme, layout)
- Not touching backend code
- Not adding new features

## Decisions

### Decision 1: Complete Removal vs. Graceful Deprecation
**Choice**: Complete removal (no compatibility layer)

**Rationale**:
- Backend Context Manager is already working and tested
- No users are depending on LocalStorage anymore
- Keeping deprecated code adds maintenance burden
- Console warnings show the old code path is still active

**Alternatives Considered**:
- Keep methods but make them no-ops → Still causes confusion, doesn't reduce bundle size
- Add feature flag → Unnecessary complexity for completed migration

### Decision 2: Remove in One PR vs. Incremental
**Choice**: Remove all deprecated chat methods in one atomic change

**Rationale**:
- Small, focused scope (only chat storage, ~300 LOC)
- All methods are tightly coupled
- Easier to review and test as a unit
- No intermediate broken states

### Decision 3: Storage Service Future
**Choice**: Keep StorageService but only for UI preferences

**Purpose Going Forward**:
- Theme preferences (light/dark mode)
- Layout preferences (sidebar collapsed state)
- User settings (editor preferences, etc.)
- Any non-chat-related UI state

**Not For**:
- Chat data (use BackendContextService)
- System prompts (use BackendContextService)
- Tool configurations (use backend)

## Risks / Trade-offs

### Risk 1: Breaking Old Data Access
**Mitigation**: Backend already has all data; LocalStorage is write-only dead code

### Risk 2: Missed Call Sites
**Mitigation**: TypeScript will catch removed methods; test all user flows

### Risk 3: Hidden Dependencies
**Mitigation**: Grep for all method names before removal

## Migration Plan

**Phase 1: Code Removal**
1. Remove deprecated methods from `StorageService.ts`
2. Remove `saveChats` action from store
3. Remove debounced subscriber from `store/index.ts`
4. Remove call sites in `useChatManager.ts`

**Phase 2: Verification**
1. Build succeeds (TypeScript happy)
2. No console warnings during normal use
3. All chat operations work
4. UI preferences still save/load

**Phase 3: Cleanup**
1. Remove unused types
2. Update documentation
3. Remove unused constants

**Rollback Plan**:
- Git revert (all changes in one commit)
- No data loss possible (backend has everything)

## Open Questions - RESOLVED

- [x] **Are there any other services or utilities calling these methods?**
  - **Decision**: Frontend only uses backend Context Manager. Any other sources (if they exist) should also use the Context Manager via API communication, not LocalStorage.
  
- [x] **Should we also remove the `messageCache`?**
  - **Decision**: YES. All caching should be handled by the backend. Remove `messageCache`, `maxCacheSize`, and all cache-related methods (`addToCache`, `clearCache`).
  
- [x] **Do we need a data migration script for anyone still on old versions?**
  - **Decision**: NO. We are committing to the new architecture only. Users should use the backend-first approach from now on.

