## ADDED Requirements

### Requirement: Agent orchestrator workspace crate

The workspace SHALL NOT include the `agent_orchestrator` crate.
The backend agent execution loop SHALL be provided by the supported backend agent-loop implementation.

#### Scenario: Building the workspace without agent_orchestrator

- **WHEN** the workspace is built
- **THEN** the `agent_orchestrator` crate is not included as a workspace member
- **AND** the supported backend agent-loop implementation is available
