## ADDED Requirements

### Requirement: Parallel Session Tabs

The Agent UI SHALL allow multiple running Claude sessions to be open concurrently
and switched via tabs, while preserving each session's stream buffer and state.

#### Scenario: Switch between active sessions

- **GIVEN** two Claude sessions are running
- **WHEN** the user switches tabs between them
- **THEN** each tab shows the correct streaming output and history for its session

#### Scenario: Continue streaming in background

- **GIVEN** a Claude session is streaming
- **WHEN** the user switches to another session tab
- **THEN** the original session continues streaming in the backend and the UI
  resumes with all output when returning to its tab

### Requirement: Tabbed Session Targeting

The Agent UI SHALL route prompts and session controls to the session selected
by the active tab.

#### Scenario: Send prompt to active tab session

- **GIVEN** multiple sessions are open in tabs
- **WHEN** the user submits a prompt in the active tab
- **THEN** the prompt executes against that tab's session
