## REMOVED Requirements

### Requirement: Agent orchestrator workspace crate
**Reason**: The `agent_orchestrator` crate is unused by application entrypoints and maintained
agent-loop functionality lives elsewhere in the backend.
**Migration**: No client-facing migration. Internal consumers must depend on the supported backend
agent-loop implementation instead of `agent_orchestrator`.

The workspace SHALL include an `agent_orchestrator` crate for agent execution loops and todo
management.

#### Scenario: Building the workspace with agent_orchestrator
- **WHEN** the workspace is built
- **THEN** the `agent_orchestrator` crate is included as a workspace member
