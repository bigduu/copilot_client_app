## ADDED Requirements

### Requirement: Backend Context Service
The frontend SHALL provide a service for communicating with backend context management APIs.

#### Scenario: Create context via API
- **WHEN** user starts a new chat
- **THEN** BackendContextService calls POST /v1/contexts
- **AND** new context ID is stored
- **AND** UI updates to show new chat

#### Scenario: Fetch messages via API
- **WHEN** user opens an existing chat
- **THEN** BackendContextService calls GET /v1/contexts/{id}/messages
- **AND** messages are loaded and displayed

#### Scenario: Send message via API
- **WHEN** user sends a message
- **THEN** BackendContextService calls POST /v1/contexts/{id}/messages
- **AND** message is added to conversation
- **AND** LLM response is initiated via backend

#### Scenario: Handle streaming updates
- **WHEN** backend streams message updates
- **THEN** frontend receives updates via polling or SSE
- **AND** UI updates in real-time
- **AND** streaming cursor is displayed

#### Scenario: Handle errors gracefully
- **WHEN** API call fails
- **THEN** error is displayed to user
- **AND** retry mechanism is available
- **AND** partial state is preserved

### Requirement: State Polling Mechanism
The frontend SHALL poll backend state to keep UI synchronized.

#### Scenario: Poll for context updates
- **WHEN** a context is active
- **THEN** frontend polls GET /v1/contexts/{id} periodically
- **AND** UI updates when state changes
- **AND** polling rate is optimized (not too frequent, not too slow)

#### Scenario: Handle state transitions
- **WHEN** backend state changes (e.g., AwaitingToolApproval)
- **THEN** UI updates to reflect new state
- **AND** appropriate UI elements are shown/hidden

### Requirement: Optimistic UI Updates
The frontend SHALL provide optimistic updates for better user experience.

#### Scenario: Optimistic message send
- **WHEN** user sends a message
- **THEN** UI immediately shows the message
- **AND** updates from API response refine the display
- **AND** errors are handled gracefully

#### Scenario: Rollback on error
- **WHEN** optimistic update fails
- **THEN** UI rolls back to previous state
- **AND** error is shown to user

### Requirement: Tool Display Enhancement
The frontend SHALL handle enhanced tool call display metadata.

#### Scenario: Display collapsible tool result
- **WHEN** tool result has display_preference: Collapsible
- **THEN** result is shown in collapsible UI component
- **AND** user can expand/collapse

#### Scenario: Hide tool result
- **WHEN** tool result has display_preference: Hidden
- **THEN** result is not shown in UI
- **AND** only summary is displayed

#### Scenario: Apply UI hints
- **WHEN** tool call includes ui_hints
- **THEN** UI applies specified rendering instructions
- **AND** rendering is customized accordingly

## MODIFIED Requirements

### Requirement: Chat State Management via Backend
Chat state SHALL be retrieved from and synchronized with backend Context Manager instead of being managed locally.

#### Scenario: Load chat from backend
- **WHEN** app initializes
- **THEN** chat list is fetched from GET /v1/contexts
- **AND** contexts are loaded and displayed
- **AND** active context is set

#### Scenario: Create new chat
- **WHEN** user creates new chat
- **THEN** API call creates backend context
- **AND** UI updates to show new chat
- **AND** no local storage is used

#### Scenario: Switch between chats
- **WHEN** user selects different chat
- **THEN** context is loaded from backend
- **AND** messages are fetched via API
- **AND** UI updates accordingly

### Requirement: System Prompt Management via API
System prompts SHALL be managed via backend API instead of LocalStorage.

#### Scenario: View system prompts
- **WHEN** user opens prompt manager
- **THEN** prompts are fetched from GET /v1/system-prompts
- **AND** prompts are displayed in list

#### Scenario: Create system prompt
- **WHEN** user creates prompt
- **THEN** API call sends prompt to backend
- **AND** UI updates to show new prompt
- **AND** prompt can be assigned to branches

#### Scenario: Edit system prompt
- **WHEN** user edits prompt
- **THEN** update is sent to PUT /v1/system-prompts/{id}
- **AND** all contexts using prompt reflect change

## REMOVED Requirements

### Requirement: Frontend XState Machine for Chat
**Reason**: Backend Context Manager FSM is the authoritative state machine
**Migration**: Remove chatInteractionMachine.ts, use backend state polling instead

### Requirement: LocalStorage Chat Persistence
**Reason**: All chat data is now stored in backend Context Manager
**Migration**: StorageService now only handles UI preferences (theme, layout, etc.)

### Requirement: Zustand Chat Slice
**Reason**: Chat state is now managed via backend API calls
**Migration**: Remove chatSessionSlice, use BackendContextService with simple React state

### Requirement: Frontend System Prompt Slice
**Reason**: System prompts are now managed by backend
**Migration**: Remove promptSlice, use API-based management

