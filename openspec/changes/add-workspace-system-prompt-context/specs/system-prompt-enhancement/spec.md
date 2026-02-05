## ADDED Requirements

### Requirement: Workspace Context Attachment

The system SHALL append a workspace context segment to the effective system prompt when a chat has a configured workspace path. The workspace segment MUST include the absolute workspace root, state that file references are relative to that root, and instruct the model to check the workspace first and then `~/.bodhi` when asked to inspect files. The workspace segment MUST be appended after the enhancement pipeline and separated by a blank line. If no workspace path is configured, the workspace segment MUST be omitted.

#### Scenario: Workspace context appended

- **WHEN** a chat has a configured workspace path and an effective system prompt is built
- **THEN** the outgoing system prompt includes a workspace context segment appended after the enhancement pipeline with a blank line separator that states the absolute workspace path and the workspace-first, `~/.bodhi`-second file lookup order

#### Scenario: Workspace context omitted

- **WHEN** a chat has no workspace path configured
- **THEN** the outgoing system prompt does not include a workspace context segment
