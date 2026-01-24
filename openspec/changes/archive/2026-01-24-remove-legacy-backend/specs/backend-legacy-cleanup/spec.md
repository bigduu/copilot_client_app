## ADDED Requirements

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
