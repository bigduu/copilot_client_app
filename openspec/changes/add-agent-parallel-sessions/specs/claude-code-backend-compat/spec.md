## MODIFIED Requirements

### Requirement: Process Registry And Live Output Cache

The application SHALL track running Claude sessions and provide live output access
consistent with opcode, including concurrent sessions.

#### Scenario: Register and list running sessions

- **WHEN** Claude Code emits `system:init` with a `session_id`
- **THEN** the backend registers the session and includes it in
  `list_running_claude_sessions`

#### Scenario: Fetch live output

- **WHEN** the frontend calls `get_claude_session_output`
- **THEN** the backend returns the buffered live output for that session

#### Scenario: Concurrent session output

- **GIVEN** multiple Claude sessions are running
- **WHEN** the frontend requests live output for each session
- **THEN** the backend returns the correct buffered output per session without
  mixing streams

#### Scenario: Start a new session without terminating others

- **GIVEN** one or more Claude sessions are running
- **WHEN** a new Claude session is started
- **THEN** the backend keeps existing session processes running and registers
  the new session separately
