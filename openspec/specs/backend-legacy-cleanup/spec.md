# backend-legacy-cleanup Specification

## Purpose

TBD - created by archiving change remove-agent-orchestrator. Update Purpose after archive.

## Requirements

### Requirement: Agent orchestrator workspace crate

The workspace SHALL NOT include the `agent_orchestrator` crate.
The backend agent execution loop SHALL be provided by the supported backend agent-loop implementation.

#### Scenario: Building the workspace without agent_orchestrator

- **WHEN** the workspace is built
- **THEN** the `agent_orchestrator` crate is not included as a workspace member
- **AND** the supported backend agent-loop implementation is available

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
