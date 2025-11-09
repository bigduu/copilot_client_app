# Deprecated Code - Refactor Context Session Architecture

**Date**: 2025-11-09  
**Phase**: Phase 10 - Frontend SSE Migration  
**Status**: Marked for removal after Phase 10 completion

---

## Overview

This document lists all deprecated code that will be removed after the Phase 10 frontend migration is complete and tested. All deprecated code has been marked with `@deprecated` JSDoc tags and `console.warn()` statements.

---

## Deprecated Components

### 1. AIService (Class)

**File**: `src/services/AIService.ts`

**Status**: ⚠️ **DEPRECATED** - Entire class

**Reason**:
- Direct OpenAI streaming bypasses backend FSM and state management
- Cannot support tool auto-loop, approval system, and other backend features
- Replaced by backend-driven Signal-Pull architecture

**Migration Path**:
```typescript
// OLD (Deprecated)
const aiService = new AIService();
await aiService.executePrompt(messages, model, onChunk, abortSignal);

// NEW (Recommended)
const backendService = new BackendContextService();

// 1. Send message (non-streaming)
await backendService.sendMessage(contextId, content);

// 2. Subscribe to SSE events
const unsubscribe = backendService.subscribeToContextEvents(
  contextId,
  async (event) => {
    if (event.type === "content_delta") {
      // Pull content from REST API
      const content = await backendService.getMessageContent(
        event.context_id,
        event.message_id,
        currentSequence
      );
      // Update UI with content
    }
  }
);
```

**Removal Timeline**: After Phase 10 migration is complete (estimated 2-3 days)

**References**:
- `FRONTEND_MIGRATION_PLAN.md` - Detailed migration guide
- `FRONTEND_QUICK_REFERENCE.md` - Code examples

---

### 2. BackendContextService.sendMessageStream() (Method)

**File**: `src/services/BackendContextService.ts`

**Status**: ⚠️ **DEPRECATED** - Method

**Reason**:
- Old SSE implementation with full content streaming
- Replaced by Signal-Pull architecture (metadata signals + REST content pull)
- Cannot support incremental content pulling and sequence tracking

**Migration Path**:
```typescript
// OLD (Deprecated)
await backendService.sendMessageStream(
  contextId,
  content,
  onChunk,
  onDone,
  onError,
  onApprovalRequired
);

// NEW (Recommended)
// 1. Send message (non-streaming)
await backendService.sendMessage(contextId, content);

// 2. Subscribe to SSE events
const unsubscribe = backendService.subscribeToContextEvents(
  contextId,
  async (event) => {
    switch (event.type) {
      case "content_delta":
        const content = await backendService.getMessageContent(
          event.context_id,
          event.message_id,
          currentSequence
        );
        onChunk(content.content);
        currentSequence = content.sequence;
        break;
      
      case "message_completed":
        onDone();
        break;
      
      case "state_changed":
        // Handle state changes
        break;
    }
  },
  (error) => onError(error.message)
);
```

**Removal Timeline**: After Phase 10 migration is complete

**References**:
- `FRONTEND_MIGRATION_PLAN.md` - Section 2.1
- `FRONTEND_QUICK_REFERENCE.md` - SSE Event Handling

---

### 3. chatInteractionMachine.aiStream (Actor)

**File**: `src/core/chatInteractionMachine.ts`

**Status**: ⚠️ **DEPRECATED** - Actor

**Reason**:
- Direct AIService streaming bypasses backend FSM
- Cannot support tool auto-loop and approval system
- Replaced by backend-driven Signal-Pull architecture

**Migration Path**:
```typescript
// OLD (Deprecated)
invoke: {
  id: "aiStream",
  src: "aiStream",
  input: ({ context }) => ({ messages: context.messages }),
}

// NEW (Recommended)
invoke: {
  id: "contextStream",
  src: "contextStream",
  input: ({ context }) => ({ contextId: context.currentContextId || "" }),
}
```

**Removal Timeline**: After Phase 10 migration is complete

**References**:
- `FRONTEND_MIGRATION_PLAN.md` - Section 2.2
- `src/core/chatInteractionMachine.ts` - Line 160+ (contextStream actor)

---

## Deprecation Markers

All deprecated code has been marked with:

### 1. JSDoc `@deprecated` Tag
```typescript
/**
 * @deprecated This method is deprecated and will be removed in a future version.
 * 
 * **Migration Path**: Use X instead
 * **Why deprecated**: Reason
 * **Removal timeline**: Timeline
 * 
 * @see ReplacementMethod
 */
```

### 2. Console Warnings
```typescript
console.warn(
  "[Component] ⚠️ DEPRECATED: method() is deprecated. Use replacement() instead."
);
```

### 3. Code Comments
```typescript
// TODO: Remove after Phase 10 migration is complete
// DEPRECATED: Use contextStream instead
```

---

## Removal Checklist

Before removing deprecated code, ensure:

- [ ] Phase 10 migration is 100% complete
- [ ] All tests pass with new architecture
- [ ] Feature flag `USE_SIGNAL_PULL_SSE` is enabled
- [ ] Manual testing completed (20 test cases)
- [ ] Integration testing completed (6 test cases)
- [ ] Performance testing completed (4 test cases)
- [ ] No references to deprecated code in active code paths
- [ ] Documentation updated to remove deprecated references

---

## Removal Steps

### Step 1: Verify No Active Usage

Search for usage of deprecated components:

```bash
# Search for AIService usage
grep -r "new AIService" src/

# Search for sendMessageStream usage
grep -r "sendMessageStream" src/

# Search for aiStream actor usage
grep -r '"aiStream"' src/
```

### Step 2: Remove Deprecated Code

1. **Remove AIService**:
   ```bash
   rm src/services/AIService.ts
   ```

2. **Remove sendMessageStream**:
   - Delete method from `BackendContextService.ts`
   - Remove related types and interfaces

3. **Remove aiStream actor**:
   - Delete actor definition from `chatInteractionMachine.ts`
   - Remove related event handlers

### Step 3: Update Imports

Remove imports of deprecated components:

```typescript
// Remove these imports
import { AIService } from "../services/AIService";
```

### Step 4: Update Tests

Remove or update tests that use deprecated code:

```bash
# Find tests using deprecated code
grep -r "AIService" src/**/*.test.ts
grep -r "sendMessageStream" src/**/*.test.ts
```

### Step 5: Update Documentation

Remove references to deprecated code from:

- [ ] README.md
- [ ] API documentation
- [ ] Architecture documentation
- [ ] Code comments

---

## Timeline

| Phase | Status | Estimated Date |
|-------|--------|----------------|
| Mark as deprecated | ✅ Complete | 2025-11-09 |
| Phase 10 migration | 🚧 In Progress | 2025-11-10 to 2025-11-12 |
| Testing & validation | ⏸️ Pending | 2025-11-12 to 2025-11-13 |
| Enable feature flag | ⏸️ Pending | 2025-11-13 |
| Remove deprecated code | ⏸️ Pending | 2025-11-14 |

---

## Impact Analysis

### Files Affected by Removal

1. **AIService.ts** (143 lines) - DELETE
2. **BackendContextService.ts** - Remove `sendMessageStream()` method (~150 lines)
3. **chatInteractionMachine.ts** - Remove `aiStream` actor (~45 lines)

**Total lines to remove**: ~338 lines

### Dependencies

**AIService** is currently used by:
- ❌ `chatInteractionMachine.ts` - aiStream actor (deprecated)
- ✅ No other active usage

**sendMessageStream** is currently used by:
- ❌ `useChatManager.ts` - sendMessage function (will be replaced)
- ✅ No other active usage

**aiStream** is currently used by:
- ❌ `chatInteractionMachine.ts` - THINKING state (will be replaced)
- ✅ No other active usage

---

## Rollback Plan

If issues are found after removal:

1. **Revert commit**: Use git to revert the removal commit
2. **Re-enable deprecated code**: Uncomment deprecated code
3. **Disable feature flag**: Set `USE_SIGNAL_PULL_SSE = false`
4. **Investigate issues**: Debug and fix problems
5. **Retry removal**: After fixes are verified

---

## Questions & Support

If you have questions about deprecated code or migration:

1. **Read documentation**:
   - `FRONTEND_MIGRATION_PLAN.md` - Detailed migration guide
   - `FRONTEND_QUICK_REFERENCE.md` - Quick reference
   - `PHASE_10_PROGRESS.md` - Current progress

2. **Check examples**:
   - `src/services/BackendContextService.ts` - New methods
   - `src/core/chatInteractionMachine.ts` - contextStream actor
   - `src/types/sse.ts` - Type definitions

3. **Test locally**:
   - Enable `USE_SIGNAL_PULL_SSE = true`
   - Test with real backend
   - Verify all features work

---

## Summary

✅ **3 components marked as deprecated**:
- AIService (entire class)
- BackendContextService.sendMessageStream() (method)
- chatInteractionMachine.aiStream (actor)

✅ **All deprecated code has**:
- `@deprecated` JSDoc tags
- Console warnings
- Migration path documentation
- Removal timeline

⏸️ **Removal pending**:
- Phase 10 migration completion
- Testing and validation
- Feature flag enablement

**Estimated removal date**: 2025-11-14 (5 days from now)

---

**Last Updated**: 2025-11-09  
**Next Review**: After Phase 10 completion

