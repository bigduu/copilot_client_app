# backend-legacy-cleanup Specification

## Purpose

TBD - created by archiving change remove-agent-orchestrator. Update Purpose after archive.
## Requirements
### Requirement: Agent orchestrator workspace crate

The workspace SHALL NOT include the `agent_orchestrator` crate.
The backend SHALL NOT include or depend on a backend agent execution loop; agent
orchestration SHALL run in the frontend runtime.

#### Scenario: Building the workspace without backend agent loop

- **WHEN** the workspace is built
- **THEN** the `agent_orchestrator` crate is not included as a workspace member
- **AND** backend crates do not include a backend agent execution loop

### Requirement: Legacy tool approval endpoint

The system SHALL NOT expose a legacy tool approval endpoint at `POST /v1/contexts/{id}/tools/approve`.

#### Scenario: Approve tool calls via legacy endpoint

- **WHEN** a client submits tool call IDs to `/v1/contexts/{id}/tools/approve`
- **THEN** the server rejects the request and does not approve tool calls

### Requirement: Legacy storage migration CLI

The system SHALL NOT provide a `migrate` CLI subcommand for legacy conversation storage.

#### Scenario: Run legacy migration command

- **WHEN** an operator attempts to run the `migrate` subcommand
- **THEN** the CLI reports the subcommand is unavailable and does not migrate contexts

### Requirement: Legacy storage migration API

The storage layer SHALL NOT expose a `StorageMigration` utility for legacy contexts.

#### Scenario: Detect legacy contexts via storage migration

- **WHEN** a component attempts to access `StorageMigration` from the storage layer
- **THEN** the storage layer does not provide the utility

### Requirement: File-based legacy storage provider

The system SHALL NOT provide a `FileStorageProvider` for legacy context storage.

#### Scenario: Save and load context via file-based storage

- **WHEN** a component attempts to use `FileStorageProvider`
- **THEN** the provider is unavailable and no legacy file-based storage is used

### Requirement: Deprecated agent/context/message modules removed

The backend workspace SHALL NOT expose deprecated agent, context, or message modules
from `chat_core`.

#### Scenario: Compile backend crates without deprecated modules

- **WHEN** backend crates are compiled
- **THEN** there are no public exports of `chat_core::agent`, `chat_core::context`, or
  `chat_core::message`

