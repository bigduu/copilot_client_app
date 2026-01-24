## ADDED Requirements

### Requirement: Stateless backend forwarding

The backend SHALL operate as a stateless request-forwarding proxy and SHALL NOT persist server-side
conversation contexts or sessions.

#### Scenario: Forward a chat request without server state

- **WHEN** a client submits a model request to the backend forwarding API
- **THEN** the backend forwards the request upstream and returns the upstream response
- **AND** no server-side context/session state is created or required

### Requirement: No server-side session management

The backend SHALL NOT persist or manage chat sessions.

#### Scenario: Persist sessions on the server

- **WHEN** a client creates or updates a session
- **THEN** the backend does not store session state and requires client-managed session identity

### Requirement: No server-side context pipelines

The backend SHALL NOT persist chat contexts or apply server-side message processing pipelines.

#### Scenario: Save and update a context on the server

- **WHEN** a client sends messages within a context
- **THEN** the backend forwards the request without storing or updating server-side context

### Requirement: No server-side tool execution

The backend SHALL NOT execute tools or manage tool approval flows.

#### Scenario: Execute a tool call on the server

- **WHEN** a model request includes tool calls
- **THEN** the backend forwards the request upstream without executing tool calls
