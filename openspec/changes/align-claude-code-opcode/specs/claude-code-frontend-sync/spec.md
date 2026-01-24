## ADDED Requirements
### Requirement: Opcode-Style Stream Synchronization
The Agent UI SHALL synchronize Claude Code streaming output using opcode's generic-to-scoped listener flow and session-id rebinding.

#### Scenario: Session ID rebinding
- **GIVEN** the UI starts listening with generic `claude-output` events
- **WHEN** a `system:init` message announces a new `session_id`
- **THEN** the UI switches to scoped `claude-output:{session_id}` listeners and continues streaming without losing messages

### Requirement: Session Recovery And Persistence
The Agent UI SHALL persist session context and recover running sessions using backend running-session data.

#### Scenario: Restore a running session
- **GIVEN** a Claude session is running
- **WHEN** the user returns to Agent mode
- **THEN** the UI reconnects to the session and continues streaming output

### Requirement: Queued Prompts And Session Controls
The Agent UI SHALL support queued prompts and the execution controls present in opcode's Claude Code session UI.

#### Scenario: Queue a prompt while streaming
- **GIVEN** a session is currently streaming output
- **WHEN** the user submits another prompt
- **THEN** the UI queues the prompt and executes it after the current run completes

### Requirement: Claude Session Tooling Panels
The Agent UI SHALL expose opcode-equivalent Claude session tooling panels for timelines/checkpoints, slash commands, and preview.

#### Scenario: Open session tooling
- **WHEN** the user opens session tooling
- **THEN** the UI presents the timeline/checkpoint view, slash commands management, and preview controls scoped to the active session
