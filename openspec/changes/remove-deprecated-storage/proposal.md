## Why

The frontend still uses deprecated LocalStorage-based chat management methods (`saveAllData`, `saveChats`, `saveMessages`, `saveLatestActiveChatId`) that were marked as deprecated during the migration to the backend Context Manager. These methods are causing console warnings on every user interaction and are no longer needed since the backend now handles all chat context management. Removing them will clean up the codebase, eliminate console noise, and complete the migration to the backend-first architecture.

## What Changes

**BREAKING**: This change removes all deprecated LocalStorage chat management code from the frontend.

### Frontend Changes

- Remove deprecated chat storage methods from `StorageService.ts`:
  - `saveAllData()`
  - `saveChats()` (private)
  - `saveMessages()`
  - `deleteMessages()`
  - `deleteMultipleMessages()`
  - `loadMessages()`
  - `loadLatestActiveChatId()`
  - `saveLatestActiveChatId()`
  - `loadChats()` (private)
  - `saveSystemPrompts()` (already migrated to backend)
  - `getSystemPrompts()` (already migrated to backend)
- Remove `saveChats` action from `chatSessionSlice.ts`
- Remove debounced storage subscriber from `store/index.ts` that calls `saveAllData` and `saveLatestActiveChatId`
- Remove `saveChats()` calls from `useChatManager.ts`
- Keep only UI-related storage methods (theme, layout preferences)

### Impact on Users

- **Zero impact**: All chat data is now managed by the backend Context Manager
- Console will be clean without deprecation warnings
- Reduced frontend bundle size

## Impact

- **Affected specs**: None (no existing specs found)
- **Affected code**:
  - `src/services/StorageService.ts` - Remove deprecated chat methods
  - `src/store/slices/chatSessionSlice.ts` - Remove `saveChats` action
  - `src/store/index.ts` - Remove storage subscriber
  - `src/hooks/useChatManager.ts` - Remove `saveChats()` calls
  - `src/types/storage.ts` - May need cleanup of unused types
- **Breaking Changes**: None for end users (backend already handles everything)
- **Dependencies**: Requires `migrate-frontend-to-context-manager` to be complete







