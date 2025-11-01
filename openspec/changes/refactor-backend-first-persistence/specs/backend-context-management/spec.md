# Backend Context Management - Spec Deltas

## ADDED Requirements

### Requirement: Automatic State Persistence
The backend FSM SHALL automatically persist the chat context to storage after every state transition that modifies context data.

#### Scenario: User message persisted automatically
- **WHEN** a user sends a message via `POST /api/contexts/{id}/actions/send_message`
- **AND** the FSM processes the message and transitions to `ProcessingUserMessage` state
- **THEN** the backend SHALL save the updated context to storage without frontend intervention
- **AND** the response SHALL include the persisted message with backend-generated ID

#### Scenario: Assistant message persisted during streaming
- **WHEN** the FSM receives LLM response chunks
- **AND** the assistant message is added to the context
- **THEN** the backend SHALL persist the complete message after streaming completes
- **AND** subsequent GET requests SHALL return the persisted content

#### Scenario: Tool call results persisted automatically
- **WHEN** tool calls are approved and executed
- **AND** tool results are added to the context
- **THEN** the backend SHALL persist the updated context including tool results
- **AND** the FSM SHALL continue processing without waiting for frontend

#### Scenario: Persistence failure handling
- **WHEN** automatic save fails (e.g., disk full, permission error)
- **THEN** the backend SHALL log the error with context ID and state
- **AND** the FSM SHALL transition to `Failed` state with error details
- **AND** the API response SHALL return 500 with error message

### Requirement: Action-Based Message API
The backend SHALL provide high-level action endpoints that encapsulate FSM transitions and persistence.

#### Scenario: Send message action
- **GIVEN** a valid context ID and message content
- **WHEN** `POST /api/contexts/{id}/actions/send_message` is called with JSON `{"content": "user message"}`
- **THEN** the backend SHALL add the user message to the context
- **AND** trigger FSM processing (including LLM call, tool execution, etc.)
- **AND** automatically persist all state changes
- **AND** return HTTP 200 with full context state including new messages

#### Scenario: Approve tools action
- **GIVEN** a context in `AwaitingToolApproval` state
- **WHEN** `POST /api/contexts/{id}/actions/approve_tools` is called with approved tool call IDs
- **THEN** the backend SHALL update tool approval status in context
- **AND** resume FSM processing (execute tools, call LLM with results)
- **AND** automatically persist all changes
- **AND** return HTTP 200 with updated state

#### Scenario: Invalid action on wrong state
- **GIVEN** a context in `Idle` state
- **WHEN** `POST /api/contexts/{id}/actions/approve_tools` is called
- **THEN** the backend SHALL return HTTP 400 with error "No pending tool approvals"
- **AND** the context state SHALL remain unchanged

### Requirement: State Polling Endpoint
The backend SHALL provide a read-only endpoint for clients to poll current chat state.

#### Scenario: Poll for state updates
- **WHEN** `GET /api/contexts/{id}/state` is called
- **THEN** the backend SHALL return HTTP 200 with JSON containing:
  - Current FSM state (e.g., "Idle", "ProcessingUserMessage", "AwaitingToolApproval")
  - All messages in the active branch
  - Pending tool calls (if any)
  - Last update timestamp
- **AND** the response SHALL be cached for 100ms to reduce load

#### Scenario: Poll non-existent context
- **WHEN** `GET /api/contexts/{invalid-id}/state` is called
- **THEN** the backend SHALL return HTTP 404 with error "Context not found"

#### Scenario: Poll with If-None-Match (efficient polling)
- **GIVEN** client has cached state with ETag "abc123"
- **WHEN** `GET /api/contexts/{id}/state` is called with header `If-None-Match: "abc123"`
- **AND** the context has not changed since ETag generation
- **THEN** the backend SHALL return HTTP 304 Not Modified
- **AND** no response body SHALL be sent

### Requirement: Dirty Flag Optimization
The backend SHALL use dirty flags to skip redundant saves when context has not been modified.

#### Scenario: Skip save when no changes
- **GIVEN** a context in `Idle` state with `dirty = false`
- **WHEN** the FSM loop checks for state changes
- **AND** no messages or state transitions have occurred
- **THEN** the backend SHALL NOT write to storage
- **AND** file I/O operations SHALL remain at 0

#### Scenario: Save when dirty
- **GIVEN** a context with `dirty = true` after adding a message
- **WHEN** the FSM completes a state transition
- **THEN** the backend SHALL write the context to storage
- **AND** reset `dirty = false` after successful save

## MODIFIED Requirements

### Requirement: Message Creation
The backend SHALL create and persist messages through FSM actions, not direct CRUD operations.

**Previous Behavior**: Frontend could directly add messages via `POST /api/contexts/{id}/messages`.

**New Behavior**:
- Direct message creation endpoint is deprecated
- Messages MUST be created via action endpoints (`/actions/send_message`)
- FSM automatically handles persistence
- Direct CRUD endpoint remains for backward compatibility but logs deprecation warning

#### Scenario: Create message via action (new)
- **WHEN** `POST /api/contexts/{id}/actions/send_message` is called
- **THEN** message is created, FSM processes, and state is persisted automatically

#### Scenario: Create message via deprecated CRUD (backward compat)
- **WHEN** `POST /api/contexts/{id}/messages` is called
- **THEN** backend SHALL log warning "Deprecated endpoint used"
- **AND** SHALL still create message and persist manually
- **AND** response SHALL include `Deprecation` header with migration guide URL

## REMOVED Requirements

_None - all existing functionality is preserved, only internal implementation changes._

## RENAMED Requirements

_None - requirement names remain consistent._

