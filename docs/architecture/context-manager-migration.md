# Context Manager Migration Architecture

## Overview

This document describes the migration from frontend-local chat state management to a unified backend Context Manager architecture.

## Motivation

The previous architecture had a dual-context management system:
- **Frontend**: Zustand stores + LocalStorage for persistence
- **Backend**: Context Manager crate with FSM, branches, and message pooling

This created:
- State synchronization issues
- Duplicated business logic
- Limited ability to use advanced features (branches, etc.)
- LocalStorage size and performance constraints

## New Architecture

### Backend as Single Source of Truth

All chat context is now managed by the backend Context Manager:

```
┌─────────────────────────────────────┐
│         Frontend (React)            │
│  ┌──────────────────────────────┐   │
│  │   BackendContextService      │   │
│  │   (API client layer)         │   │
│  └──────────┬───────────────────┘   │
│             │ HTTP/REST API          │
└─────────────┼────────────────────────┘
              │
┌─────────────┼────────────────────────┐
│             ▼                        │
│  ┌──────────────────────────────┐   │
│  │  Context Controller          │   │
│  │  System Prompt Controller    │   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │  ChatSessionManager          │   │
│  │  (Session facade)            │   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │  Context Manager             │   │
│  │  - FSM management            │   │
│  │  - Branch support            │   │
│  │  - Message pooling (O(1))    │   │
│  └──────────┬───────────────────┘   │
│             │                        │
│  ┌──────────▼───────────────────┐   │
│  │  FileStorageProvider         │   │
│  │  (JSON persistence)          │   │
│  └──────────────────────────────┘   │
│         Backend (Rust)               │
└──────────────────────────────────────┘
```

### REST API Endpoints

#### Context Management
- `POST /v1/contexts` - Create new context
- `GET /v1/contexts` - List all contexts
- `GET /v1/contexts/{id}` - Get specific context
- `PUT /v1/contexts/{id}` - Update context
- `DELETE /v1/contexts/{id}` - Delete context

#### Message Operations
- `GET /v1/contexts/{id}/messages` - Get messages (with pagination)
- `POST /v1/contexts/{id}/messages` - Add message to context

#### Tool Operations
- `POST /v1/contexts/{id}/tools/approve` - Approve pending tool calls

#### System Prompts
- `GET /v1/system-prompts` - List all prompts
- `POST /v1/system-prompts` - Create prompt
- `GET /v1/system-prompts/{id}` - Get specific prompt
- `PUT /v1/system-prompts/{id}` - Update prompt
- `DELETE /v1/system-prompts/{id}` - Delete prompt

### Frontend Changes

#### Services
- **BackendContextService**: New service for all context operations
- **StorageService**: Reduced to UI preferences only (theme, layout)

#### Hooks
- **useBackendContext**: React hook for context management with optimistic updates

#### Components
- **MigrationBanner**: UI for data migration with validation and rollback
- Message components updated to use backend approval states

### Data Migration

#### Process
1. **Validation**: Check legacy data integrity before migration
2. **Backup**: Create LocalStorage backup of all data
3. **System Prompts**: Migrate prompts to backend first
4. **Contexts**: Create backend contexts for each chat
5. **Messages**: Migrate messages with tool call metadata preservation
6. **Cleanup**: Remove legacy LocalStorage keys after success
7. **Rollback**: Restore from backup if migration fails

#### Migration Flow

```typescript
// User triggers migration from MigrationBanner
await localStorageMigrator.migrateAll();

// Migration steps:
1. validateLegacyData() → Ensure data integrity
2. createBackup() → Save to LocalStorage backup key
3. Migrate system prompts via BackendContextService
4. For each chat:
   - Create context with config
   - Migrate all messages (preserving tool calls)
5. Log results and clean up
```

#### Rollback

```typescript
// If migration fails or user wants to revert
localStorageMigrator.rollbackFromBackup();
// → Restores chats, messages, and prompts from backup
```

## Key Design Decisions

### 1. System Prompt Management in Backend
- **Decision**: Move prompts to backend storage
- **Rationale**: Enables sharing, versioning, and consistency
- **Implementation**: SystemPromptService with JSON persistence

### 2. DTO Adapter Layer
- **Decision**: Create adapter between Rust types and TypeScript types
- **Rationale**: Allows independent evolution of frontend/backend
- **Implementation**: `dto.rs` with conversion functions

### 3. Gradual Migration Strategy
- **Decision**: Keep legacy code with deprecation warnings during transition
- **Rationale**: Allows phased rollout and testing
- **Status**: Legacy slices marked deprecated but not yet removed

### 4. Tool Call Metadata Preservation
- **Decision**: Serialize tool calls as JSON in message content
- **Rationale**: Preserves display preferences and execution results
- **Implementation**: convertMessage() in LocalStorageMigrator

## Migration Status

### Completed ✅
- Backend API endpoints (Context, Message, System Prompt, Tool Approval)
- DTO adapter layer
- BackendContextService
- useBackendContext hook
- Data migration utility with validation and rollback
- Migration UI component with error display
- StorageService UI preference support with deprecation warnings
- Tool call conversion with metadata preservation

### In Progress 🔄
- Frontend component integration (ChatSidebar, ChatView using hooks)
- Streaming SSE support
- Branch selector UI

### Deferred ⏸
- Complete removal of legacy Zustand slices
- Full test coverage (test infrastructure needed)
- Real-time state synchronization (polling works for MVP)

## Performance Considerations

### Backend
- Message pool: O(1) lookups by ID
- LRU cache: Session manager caches recent contexts
- JSON storage: Efficient for typical chat sizes (<1000 messages)

### Frontend
- Optimistic updates: Immediate UI feedback
- Lazy loading: Messages loaded on-demand
- Pagination: Large message histories paginated

## Security

### API Endpoints
- All endpoints under `/v1/` prefix
- Context isolation (contexts don't leak across users in future multi-user setup)
- System prompts validated before storage

### Data Migration
- Validation before mutation
- Atomic backup creation
- Rollback capability

## Future Enhancements

### Short Term
- WebSocket/SSE for real-time state updates
- Branch selector UI for multi-branch conversations
- Complete test suite

### Medium Term
- Multi-user support with auth
- Context sharing and collaboration
- Export/import functionality

### Long Term
- Distributed storage backends (PostgreSQL, etc.)
- Context versioning and history
- Advanced search across contexts

## Migration Guide for Developers

### Using Backend Context in Components

```typescript
import { useBackendContext } from '../hooks/useBackendContext';

function ChatComponent() {
  const {
    currentContext,
    messages,
    isLoading,
    error,
    loadContext,
    addMessage,
    approveTools
  } = useBackendContext();

  // Load context
  useEffect(() => {
    if (contextId) {
      loadContext(contextId);
    }
  }, [contextId]);

  // Add message
  const handleSend = async (content: string) => {
    await addMessage(currentContext.id, 'user', content);
  };

  // Approve tools
  const handleApprove = async (toolCallIds: string[]) => {
    await approveTools(currentContext.id, toolCallIds);
  };

  return (
    // Render UI with messages, loading states, etc.
  );
}
```

### Creating System Prompts

```typescript
import { backendContextService } from '../services/BackendContextService';

// Create
await backendContextService.createSystemPrompt('my-prompt', 'You are helpful.');

// List
const prompts = await backendContextService.listSystemPrompts();

// Update
await backendContextService.updateSystemPrompt('my-prompt', 'New content');
```

### Handling Migration

```typescript
import { localStorageMigrator } from '../utils/migration/LocalStorageMigrator';

// Check if migration needed
const needs = await localStorageMigrator.needsMigration();

// Run migration
const result = await localStorageMigrator.migrateAll();
console.log(`Migrated ${result.migratedContexts} contexts`);

// Rollback if needed
localStorageMigrator.rollbackFromBackup();
```

## Troubleshooting

### Migration Fails with Validation Errors
- Check browser console for specific validation errors
- Common issues: missing message IDs, invalid timestamps
- Use MigrationBanner UI to see first 5 errors
- Manual fix: Edit LocalStorage data or clear invalid entries

### Context Operations Fail
- Verify backend service is running
- Check network tab for API errors
- Ensure context ID is valid
- Check backend logs for detailed errors

### Messages Not Appearing
- Verify context is loaded: `currentContext !== null`
- Check `isLoading` state
- Look for errors in `error` state
- Refresh messages: `loadContext(contextId)`

### Tool Approvals Not Working
- Ensure tool_call_ids are correct
- Check if context state allows approval
- Verify backend has tool execution configured
- Check ApprovalCard component for status display

## References

- [Context Manager FSM Plan](./context_manager_fsm_plan.md)
- [System Prompt Management](../reports/system_prompt_management.md)
- [Migration Implementation Summary](../../openspec/changes/migrate-frontend-to-context-manager/IMPLEMENTATION_SUMMARY.md)

