## ADDED Requirements

### Requirement: System Prompt Management in Context Manager
The Context Manager SHALL support storing and managing system prompts associated with branches.

#### Scenario: Create system prompt for branch
- **WHEN** a system prompt is created for a branch
- **THEN** the prompt is stored in the branch's system_prompt field
- **AND** the prompt can be retrieved by ID

#### Scenario: Update system prompt
- **WHEN** a system prompt is updated
- **THEN** the update is persisted and reflected in all branches using that prompt

#### Scenario: Delete system prompt
- **WHEN** a system prompt is deleted
- **THEN** all references are cleaned up
- **AND** branches using it fall back to default behavior

#### Scenario: List all system prompts
- **WHEN** a request is made for all system prompts
- **THEN** a list of all available prompts is returned with their metadata

### Requirement: Context CRUD REST API
The backend SHALL provide REST API endpoints for managing chat contexts.

#### Scenario: Create new context
- **WHEN** POST /v1/contexts is called with model_id and mode
- **THEN** a new ChatContext is created with a unique ID
- **AND** an initial "main" branch is created
- **AND** the context ID is returned

#### Scenario: Get context
- **WHEN** GET /v1/contexts/{id} is called
- **THEN** the full ChatContext is returned
- **AND** includes all branches, message pool, and current state

#### Scenario: Update context
- **WHEN** PUT /v1/contexts/{id} is called with updates
- **THEN** the context is updated
- **AND** changes are persisted to storage

#### Scenario: Delete context
- **WHEN** DELETE /v1/contexts/{id} is called
- **THEN** the context is removed from memory and storage
- **AND** all associated data is cleaned up

### Requirement: Message Management API
The backend SHALL provide API endpoints for message operations within contexts.

#### Scenario: Get messages for branch
- **WHEN** GET /v1/contexts/{id}/messages is called with branch parameter
- **THEN** messages for that branch are returned
- **AND** results are paginated for performance

#### Scenario: Add message to branch
- **WHEN** POST /v1/contexts/{id}/messages is called with message data
- **THEN** the message is added to the message_pool
- **AND** the message ID is appended to the branch's message_ids
- **AND** the updated context state is returned

### Requirement: Tool Call Display Metadata
The backend SHALL include display metadata in tool call structures.

#### Scenario: Tool call with display preference
- **WHEN** a tool call is created
- **THEN** it includes display_preference field (Default, Collapsible, Hidden)
- **AND** it includes ui_hints for frontend rendering

#### Scenario: Tool approval workflow
- **WHEN** POST /v1/contexts/{id}/tools/approve is called
- **THEN** tool approvals are updated
- **AND** context state transitions accordingly
- **AND** approved tool calls are executed

### Requirement: DTO Adapter Layer
The backend SHALL provide adapter layer to convert Context Manager structures to frontend-friendly DTOs.

#### Scenario: Convert ChatContext to DTO
- **WHEN** ChatContext is serialized for frontend
- **THEN** it is converted to a simplified DTO structure
- **AND** Rust-specific types are mapped to JSON-compatible types

#### Scenario: Convert message types
- **WHEN** InternalMessage is converted to DTO
- **THEN** ContentPart enum is mapped to flat structure
- **AND** tool call metadata is preserved

## MODIFIED Requirements

### Requirement: System Prompt CRUD via API
The backend Context Manager SHALL provide API endpoints to manage system prompts previously stored in frontend LocalStorage.

#### Scenario: Create prompt via API
- **WHEN** user creates a new system prompt in UI
- **THEN** request is sent to POST /v1/system-prompts
- **AND** backend creates and stores the prompt
- **AND** prompt ID is returned to frontend

#### Scenario: Read prompts via API
- **WHEN** frontend requests system prompts
- **THEN** GET /v1/system-prompts returns all available prompts
- **AND** prompts can be associated with context branches

#### Scenario: Update prompt via API
- **WHEN** user updates an existing prompt
- **THEN** PUT /v1/system-prompts/{id} updates the prompt
- **AND** all contexts using the prompt reflect the update

#### Scenario: Delete prompt via API
- **WHEN** user deletes a prompt
- **THEN** DELETE /v1/system-prompts/{id} removes the prompt
- **AND** all references are cleaned up

## REMOVED Requirements

### Requirement: Frontend LocalStorage Chat Management
**Reason**: All chat state is now managed by backend Context Manager
**Migration**: Existing LocalStorage data is migrated to backend contexts via migration utility

