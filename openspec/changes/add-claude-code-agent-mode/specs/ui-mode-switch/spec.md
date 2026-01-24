## ADDED Requirements

### Requirement: Mode Switch Between Chat And Agent

The application SHALL provide a global UI mode switch with at least two modes: `Chat` and `Agent`.

#### Scenario: User switches from Chat to Agent

- **GIVEN** the user is in `Chat` mode with an active chat selected
- **WHEN** the user switches to `Agent` mode
- **THEN** the Agent UI is displayed
- **AND** the Chat state (selected chat, messages, draft input) is preserved

#### Scenario: User switches from Agent to Chat

- **GIVEN** the user is in `Agent` mode with a selected project/session
- **WHEN** the user switches to `Chat` mode
- **THEN** the Chat UI is displayed
- **AND** the Agent state (selected project/session and output view) is preserved

### Requirement: Persisted Mode Preference

The application SHALL persist the last selected UI mode and restore it on next launch.

#### Scenario: App restart restores last selected mode

- **GIVEN** the user last used `Agent` mode
- **WHEN** the application is restarted
- **THEN** the application opens in `Agent` mode
