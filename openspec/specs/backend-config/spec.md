# backend-config Specification

## Purpose
TBD - created by archiving change refactor-backend-move-agent-to-frontend. Update Purpose after archive.
## Requirements
### Requirement: Global backend config in chat_core

The backend SHALL provide a global configuration loader in `chat_core` so backend
crates share a single source of truth for config values.

#### Scenario: Load backend config with precedence

- **GIVEN** a `~/.bodhi/config.json` file exists
- **WHEN** the backend loads global config
- **THEN** the JSON config is used as the base configuration
- **AND** environment variables override any matching fields

