## ADDED Requirements

### Requirement: Browse Claude Code Projects And Sessions
The application SHALL allow users to browse Claude Code projects and sessions sourced from the local Claude Code data directory.

#### Scenario: List projects
- **GIVEN** Claude Code data exists under `~/.claude/projects`
- **WHEN** the user opens Agent mode
- **THEN** the application lists available projects

#### Scenario: List sessions for a project
- **GIVEN** a project exists under `~/.claude/projects/<project-id>`
- **WHEN** the user selects the project
- **THEN** the application lists sessions derived from `*.jsonl` files in that project directory
- **AND** each session includes at least an ID and a created/modified timestamp

### Requirement: View Session History
The application SHALL allow users to load and view a session's JSONL content.

#### Scenario: Open session history
- **GIVEN** a session JSONL file exists for the selected project
- **WHEN** the user opens that session
- **THEN** the application loads and renders the session output entries

### Requirement: Execute Claude Code With Live Streaming Output
The application SHALL support executing Claude Code and streaming `stream-json` output to the UI.

#### Scenario: Start a new session
- **GIVEN** the user selected a local project path
- **WHEN** the user runs a prompt as a new session
- **THEN** the backend starts `claude` with `--output-format stream-json`
- **AND** the UI receives streaming output events until completion

#### Scenario: Continue the most recent session
- **GIVEN** the user selected a local project path
- **WHEN** the user runs a prompt in "continue" mode
- **THEN** the backend starts `claude` using the "continue" flag
- **AND** the UI receives streaming output events until completion

#### Scenario: Resume a specific session by ID
- **GIVEN** the user selected a local project path and a session ID
- **WHEN** the user runs a prompt in "resume" mode
- **THEN** the backend starts `claude` using `--resume <session_id>`
- **AND** the UI receives streaming output events until completion

### Requirement: Streaming Events Are Robust To Session ID Changes
The application SHALL not lose streaming output when the runtime `session_id` differs from an input/resumed session ID.

#### Scenario: Session init announces a different session_id
- **GIVEN** the user invoked a run intended to resume an existing session
- **WHEN** Claude Code emits `system:init` with a `session_id` that differs from the input session ID
- **THEN** the UI continues streaming and associates subsequent output with the emitted `session_id`

### Requirement: Cancellation
The application SHALL allow cancelling an in-flight Claude Code run.

#### Scenario: User cancels a running execution
- **GIVEN** a Claude Code run is currently streaming output
- **WHEN** the user clicks cancel
- **THEN** the backend attempts to terminate the underlying process
- **AND** the UI transitions to a non-running state

### Requirement: Skip Permissions Toggle (Default Off)
The application SHALL default to running Claude Code without `--dangerously-skip-permissions` and only enable it when the user explicitly opts in.

#### Scenario: Default run does not skip permissions
- **GIVEN** the user has not enabled "Skip Permissions"
- **WHEN** the user executes Claude Code
- **THEN** the backend does not pass `--dangerously-skip-permissions`

#### Scenario: User enables Skip Permissions for a run
- **GIVEN** the user explicitly enabled "Skip Permissions" for the current run
- **WHEN** the user executes Claude Code
- **THEN** the backend passes `--dangerously-skip-permissions`

### Requirement: Claude Binary Discovery And Failure UX
The application SHALL detect the `claude` binary or present an actionable error when Claude Code is not available.

#### Scenario: Claude Code not installed
- **GIVEN** the `claude` binary cannot be found
- **WHEN** the user attempts to run an Agent session
- **THEN** the application displays an error indicating Claude Code is not installed or not discoverable
- **AND** provides a path to resolution (e.g., install instructions or manual binary path override)
