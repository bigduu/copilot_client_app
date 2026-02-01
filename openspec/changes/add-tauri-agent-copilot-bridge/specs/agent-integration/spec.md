# agent-integration Specification

## ADDED Requirements

### Requirement: Tauri auto-starts agent server

When the desktop app launches via Tauri, the system SHALL start the agent server
in-process using the agent server library and a configurable port (default 8081).

#### Scenario: Tauri startup brings agent online

- **GIVEN** the user launches the app via Tauri
- **WHEN** the app finishes initialization
- **THEN** the agent server is started automatically
- **AND** the server listens on the configured port for `/api/v1` endpoints

### Requirement: Agent uses local OpenAI forwarder in Tauri mode

In Tauri mode, the agent SHALL send requests to the local OpenAI-compatible
endpoint (`/v1/chat/completions`) provided by the app and SHALL NOT trigger
device-code auth.

#### Scenario: Agent uses local forwarder

- **GIVEN** the user is authenticated via the app’s Copilot client
- **AND** the agent is started in Tauri mode
- **WHEN** the agent requests a chat completion
- **THEN** it sends the request to the local OpenAI-compatible endpoint
- **AND** no device-code prompt is shown

### Requirement: Tauri mode stores agent data in app data dir

In Tauri mode, agent session data SHALL be stored under the app data directory
(`~/.bodhi`) instead of `~/.copilot-agent`.

#### Scenario: Agent writes sessions to app data dir

- **GIVEN** the agent is running in Tauri mode
- **WHEN** a session is created or updated
- **THEN** the session data is stored under `~/.bodhi`

### Requirement: Health heartbeat with fallback

The frontend SHALL periodically check agent health and update status. When health
checks fail, the system SHALL notify the user and fall back to Direct Mode.

#### Scenario: Agent becomes unavailable

- **GIVEN** the agent was previously healthy
- **WHEN** periodic health checks fail
- **THEN** the UI indicates the agent is unavailable
- **AND** new messages are sent via Direct Mode
