## ADDED Requirements

### Requirement: Stateless backend forwarding
The backend SHALL operate as a stateless request-forwarding proxy and SHALL NOT persist server-side
conversation contexts or sessions.

#### Scenario: Forward a chat request without server state
- **WHEN** a client submits a model request to the backend forwarding API
- **THEN** the backend forwards the request upstream and returns the upstream response
- **AND** no server-side context/session state is created or required

## REMOVED Requirements

### Requirement: Server-side session management
**Reason**: Backend role is forwarding-only; session persistence is no longer a backend concern.
**Migration**: Clients must manage session identity/state client-side.

The system SHALL persist and manage chat sessions on the server.

#### Scenario: Persist sessions on the server
- **WHEN** a client creates or updates a session
- **THEN** the session is stored and can be retrieved later from the server

### Requirement: Server-side context management and pipelines
**Reason**: Backend role is forwarding-only; context persistence/pipelines are no longer needed.
**Migration**: Clients must send the full message history (or provider-native context) per request.

The system SHALL persist chat contexts and apply server-side message processing pipelines.

#### Scenario: Save and update a context on the server
- **WHEN** a client sends messages within a context
- **THEN** the server stores and updates that context state

### Requirement: Server-side tool execution and approval workflows
**Reason**: Backend role is forwarding-only; tools and approvals are not executed/managed server-side.
**Migration**: Clients (or an upstream provider) must handle tool execution and approvals.

The system SHALL execute tools server-side and manage tool approval flows.

#### Scenario: Execute a tool call on the server
- **WHEN** a model request includes tool calls
- **THEN** the server executes the tool calls and returns results
