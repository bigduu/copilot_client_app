# backend-config Specification (Delta)

## ADDED Requirements

### Requirement: Proxy auth is runtime-only

The system SHALL not persist proxy auth credentials to disk configuration and SHALL exclude `http_proxy_auth` and `https_proxy_auth` from `/bodhi/config` read/write payloads.

#### Scenario: Persisting config does not store proxy auth

- **GIVEN** a user has entered proxy auth credentials in the UI
- **WHEN** the frontend saves Bodhi config to `/bodhi/config`
- **THEN** the backend writes config without `http_proxy_auth` and `https_proxy_auth`
- **AND** subsequent `GET /bodhi/config` responses do not include proxy auth credentials

### Requirement: Frontend-sourced proxy auth updates

The system SHALL accept proxy auth credentials from the frontend and apply them to the running Copilot client without requiring a restart.

#### Scenario: Proxy auth update takes effect at runtime

- **GIVEN** the backend is running and a proxy is configured
- **WHEN** the frontend pushes proxy auth credentials
- **THEN** subsequent Copilot requests use the updated credentials
