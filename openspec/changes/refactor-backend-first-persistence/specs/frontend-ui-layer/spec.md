# Frontend UI Layer - Spec Deltas

## ADDED Requirements

### Requirement: Action-Based Message Sending
The frontend SHALL send messages to the backend via action APIs, not direct CRUD operations.

#### Scenario: User sends message
- **WHEN** user types a message and presses send
- **THEN** frontend SHALL call `POST /api/contexts/{id}/actions/send_message`
- **AND** display the message optimistically in the UI immediately
- **AND** wait for backend response with final state
- **AND** reconcile local state with backend response

#### Scenario: Message send failure
- **WHEN** user sends a message
- **AND** the action API returns HTTP 500 or network error occurs
- **THEN** frontend SHALL remove the optimistic message from UI
- **AND** display error notification to user
- **AND** allow user to retry sending

#### Scenario: Backend response differs from optimistic
- **WHEN** user sends "Hello"
- **AND** frontend displays it optimistically
- **AND** backend responds with message ID "msg-123" and timestamp "2025-11-01T10:00:00Z"
- **THEN** frontend SHALL replace optimistic message with backend version
- **AND** use backend-provided ID and timestamp as source of truth

### Requirement: State Polling and Synchronization
The frontend SHALL poll the backend for state updates to keep UI in sync with server truth.

#### Scenario: Poll active chat
- **GIVEN** user has chat "chat-1" open and active
- **WHEN** the chat component mounts
- **THEN** frontend SHALL start polling `GET /api/contexts/chat-1/state` every 1 second
- **AND** update local state with any changes from backend
- **AND** stop polling when chat is closed or window becomes inactive

#### Scenario: Reconcile backend state with local state
- **WHEN** polling returns new messages not present locally
- **THEN** frontend SHALL append them to the message list
- **AND** scroll to bottom if user is already at bottom
- **AND** show notification badge if user scrolled up

#### Scenario: Stop polling on window inactive
- **GIVEN** polling is active for chat "chat-1"
- **WHEN** user switches browser tabs or minimizes window
- **THEN** frontend SHALL stop polling immediately
- **AND** resume polling when window becomes active again

#### Scenario: Exponential backoff when no changes
- **GIVEN** polling has returned no changes for 10 consecutive requests
- **WHEN** the next poll is scheduled
- **THEN** frontend SHALL increase interval to 2 seconds
- **AND** cap maximum interval at 5 seconds
- **AND** reset to 1 second when changes are detected

### Requirement: Read-Only Local State
The frontend local state (Zustand) SHALL be treated as a cache, with backend as the source of truth.

#### Scenario: Load chats on mount
- **WHEN** application loads
- **THEN** frontend SHALL fetch all contexts from backend via `GET /api/contexts`
- **AND** fetch messages for each context via `GET /api/contexts/{id}/state`
- **AND** populate local Zustand store with backend data
- **AND** mark all data as "synced from backend"

#### Scenario: No manual persistence calls
- **WHEN** any chat state changes locally (e.g., optimistic update)
- **THEN** frontend SHALL NOT call `addMessage` or `updateMessageContent` backend APIs manually
- **AND** SHALL rely on action APIs and polling for persistence

#### Scenario: Backend state overrides local state
- **GIVEN** local state shows message "msg-1" with content "Hello"
- **WHEN** polling returns "msg-1" with content "Hello, world!"
- **THEN** frontend SHALL replace local version with backend version
- **AND** display "Hello, world!" in UI

### Requirement: Optimistic UI Updates
The frontend SHALL provide instant feedback through optimistic updates while waiting for backend confirmation.

#### Scenario: Optimistic message display
- **WHEN** user sends a message
- **THEN** frontend SHALL immediately append message to UI with temporary ID "temp-123"
- **AND** show loading indicator next to the message
- **AND** display user's message even before backend responds

#### Scenario: Replace temporary ID with real ID
- **WHEN** backend responds with message ID "msg-456" for the sent message
- **THEN** frontend SHALL find message with temp ID "temp-123"
- **AND** replace it with backend version using ID "msg-456"
- **AND** remove loading indicator

#### Scenario: Rollback optimistic update on error
- **WHEN** user sends a message
- **AND** frontend displays it optimistically
- **AND** backend returns HTTP 500 Internal Server Error
- **THEN** frontend SHALL remove the optimistic message from UI
- **AND** show error message "Failed to send. Please try again."

## MODIFIED Requirements

### Requirement: Chat Session Management
The frontend SHALL manage chat sessions by interacting with backend via actions and polling, not manual persistence.

**Previous Behavior**: Frontend manually called `BackendContextService.addMessage()` and `BackendContextService.updateMessageContent()` after local state changes.

**New Behavior**: Frontend dispatches actions to backend and polls for updates.

#### Scenario: Send message (new flow)
- **WHEN** user sends a message
- **THEN** frontend SHALL call action API `POST /actions/send_message`
- **AND** NOT call `POST /messages` directly
- **AND** NOT call `save_context` or manual persistence methods

#### Scenario: Update streaming message (new flow)
- **WHEN** assistant message streaming completes
- **THEN** frontend SHALL update local UI state only
- **AND** NOT call backend persistence APIs
- **AND** rely on backend auto-save during FSM processing
- **AND** next poll will fetch the persisted final message

### Requirement: Chat History Loading
The frontend SHALL load chat history from backend on application startup, treating backend as source of truth.

**Previous Behavior**: Partially loaded from localStorage, partially from backend.

**New Behavior**: Always load from backend, no localStorage for chat data.

#### Scenario: Load on mount
- **WHEN** application starts
- **THEN** frontend SHALL call `GET /api/contexts` to list all chats
- **AND** call `GET /api/contexts/{id}/state` for each chat to get messages
- **AND** NOT read chat data from localStorage
- **AND** populate Zustand store with backend data only

#### Scenario: Handle stale localStorage
- **GIVEN** localStorage contains old chat data
- **WHEN** application starts
- **THEN** frontend SHALL ignore localStorage chat data
- **AND** fetch fresh data from backend
- **AND** overwrite Zustand store with backend state

## REMOVED Requirements

### Requirement: Manual Message Persistence
**Reason**: Persistence is now automatic in backend FSM.

**Migration**: Remove all `await backendService.addMessage()` and `await backendService.updateMessageContent()` calls. Use action APIs instead.

**Previous Behavior**:
- Frontend called `await addMessage(chatId, message)` after local state update
- Frontend called `await updateMessageContent(chatId, messageId, content)` after streaming

**New Behavior**:
- No manual persistence calls
- Action APIs handle persistence
- Polling fetches updated state

### Requirement: Zustand Slice Persistence Methods
**Reason**: Persistence logic moved to backend.

**Migration**: Remove `async` from Zustand actions that were manually persisting. Keep optimistic updates only.

**Removed Methods/Logic**:
- Remove `await backendService.addMessage()` from `addMessage` action
- Remove `await backendService.addMessage()` from `updateMessageContent` action
- Remove persistence error handling in Zustand slice

## RENAMED Requirements

_None - requirement names remain consistent._


