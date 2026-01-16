## REMOVED Requirements

### Requirement: Legacy tool approval endpoint
**Reason**: Deprecated in favor of action-based approval APIs.
**Migration**: Clients must use the action-based approval endpoints.

The system SHALL expose a legacy tool approval endpoint at `POST /v1/contexts/{id}/tools/approve`.

#### Scenario: Approve tool calls via legacy endpoint
- **WHEN** a client submits tool call IDs to `/v1/contexts/{id}/tools/approve`
- **THEN** the server approves those tool calls and returns success

### Requirement: Legacy storage migration CLI
**Reason**: Legacy conversation storage is no longer supported.
**Migration**: There is no migration path; old data formats are unsupported.

The system SHALL provide a `migrate` CLI subcommand to move legacy conversation JSON into the new storage format.

#### Scenario: Run legacy migration command
- **WHEN** an operator runs the `migrate` subcommand with legacy and storage paths
- **THEN** the system migrates legacy contexts into the new format

### Requirement: Legacy storage migration API
**Reason**: Legacy conversation storage is no longer supported.
**Migration**: There is no migration path; old data formats are unsupported.

The storage layer SHALL expose a `StorageMigration` utility for detecting and migrating legacy contexts.

#### Scenario: Detect legacy contexts via storage migration
- **WHEN** the migration utility scans a legacy directory
- **THEN** it returns matching legacy context IDs

### Requirement: File-based legacy storage provider
**Reason**: Legacy single-file context storage is deprecated and unused.
**Migration**: Use the message-pool storage provider instead.

The system SHALL provide a `FileStorageProvider` for single-file legacy context storage.

#### Scenario: Save and load context via file-based storage
- **WHEN** a context is saved and loaded with `FileStorageProvider`
- **THEN** the context content is persisted and retrieved
