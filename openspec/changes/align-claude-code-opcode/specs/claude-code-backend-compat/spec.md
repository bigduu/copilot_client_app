## ADDED Requirements
### Requirement: Opcode-Compatible Claude Code Commands
The application SHALL expose Claude Code Tauri commands that match opcode's command names and payload shapes for project/session browsing and execution.

#### Scenario: Browse projects and sessions
- **WHEN** the frontend calls `list_projects` and `get_project_sessions`
- **THEN** the backend returns project and session metadata sourced from `~/.claude/projects`

#### Scenario: Create a project entry
- **WHEN** the frontend calls `create_project` with a filesystem path
- **THEN** the backend creates the corresponding project directory under `~/.claude/projects` and returns the new project metadata

#### Scenario: Load session history
- **WHEN** the frontend calls `load_session_history` for a session ID and project ID
- **THEN** the backend returns the JSONL entries for that session

#### Scenario: Execute and control a session
- **WHEN** the frontend calls `execute_claude_code`, `continue_claude_code`, or `resume_claude_code`
- **THEN** the backend spawns Claude Code with `--output-format stream-json` and emits stream events

#### Scenario: Cancel a session
- **WHEN** the frontend calls `cancel_claude_execution`
- **THEN** the backend terminates the running Claude process and emits completion events

### Requirement: Process Registry And Live Output Cache
The application SHALL track running Claude sessions and provide live output access consistent with opcode.

#### Scenario: Register and list running sessions
- **WHEN** Claude Code emits `system:init` with a `session_id`
- **THEN** the backend registers the session and includes it in `list_running_claude_sessions`

#### Scenario: Fetch live output
- **WHEN** the frontend calls `get_claude_session_output`
- **THEN** the backend returns the buffered live output for that session

### Requirement: Claude Binary Discovery And Selection
The application SHALL discover available Claude Code installations and persist a user-selected binary path.

#### Scenario: Discover installations
- **WHEN** the frontend requests available Claude installations
- **THEN** the backend returns discovered installations with version metadata

#### Scenario: Persist a preferred binary
- **WHEN** the frontend sets a Claude binary path
- **THEN** subsequent executions use the stored path when it is valid
