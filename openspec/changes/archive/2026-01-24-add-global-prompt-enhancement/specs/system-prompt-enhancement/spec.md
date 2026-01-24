## ADDED Requirements

### Requirement: Global Enhancement Configuration

The system SHALL allow users to view and edit a global system prompt enhancement text in System Settings and persist it locally for reuse across sessions.

#### Scenario: User saves enhancement content

- **WHEN** a user edits and saves the global enhancement text
- **THEN** the system persists the content and restores it on the next app launch

### Requirement: Enhanced Prompt Assembly

The system SHALL append the global enhancement text to the selected base system prompt when sending requests to the model.

#### Scenario: Enhancement applied to outgoing prompt

- **WHEN** a user has configured non-empty enhancement text
- **THEN** the outgoing system prompt includes the base prompt followed by the enhancement text

#### Scenario: Enhancement omitted when empty

- **WHEN** the enhancement text is empty or whitespace
- **THEN** the outgoing system prompt is the base prompt without additional content
