## MODIFIED Requirements

### Requirement: Agent orchestrator workspace crate

The workspace SHALL NOT include the `agent_orchestrator` crate.
The backend SHALL NOT include or depend on a backend agent execution loop; agent
orchestration SHALL run in the frontend runtime.

#### Scenario: Building the workspace without backend agent loop

- **WHEN** the workspace is built
- **THEN** the `agent_orchestrator` crate is not included as a workspace member
- **AND** backend crates do not include a backend agent execution loop

## ADDED Requirements

### Requirement: Deprecated agent/context/message modules removed

The backend workspace SHALL NOT expose deprecated agent, context, or message modules
from `chat_core`.

#### Scenario: Compile backend crates without deprecated modules

- **WHEN** backend crates are compiled
- **THEN** there are no public exports of `chat_core::agent`, `chat_core::context`, or
  `chat_core::message`
