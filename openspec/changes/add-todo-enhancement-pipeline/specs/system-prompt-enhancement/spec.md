## MODIFIED Requirements
### Requirement: Enhanced Prompt Assembly
The system SHALL build the effective system prompt by concatenating the base prompt with the enhancement pipeline in this order: user-defined enhancement first, then each enabled system enhancement. Non-empty segments MUST be separated by a blank line.

#### Scenario: Enhancement pipeline applied
- **WHEN** a base prompt exists, the user enhancement is non-empty, and both Mermaid and TODO enhancements are enabled
- **THEN** the outgoing system prompt includes the base prompt, user enhancement, Mermaid enhancement, and TODO enhancement in that order with blank line separators

#### Scenario: Enhancement omitted when empty or disabled
- **WHEN** an enhancement segment is empty or its toggle is disabled
- **THEN** that segment is omitted from the outgoing system prompt

## ADDED Requirements
### Requirement: Mermaid Enhancement Toggle
The system SHALL allow users to enable or disable Mermaid prompt enhancement and persist the setting locally.

#### Scenario: Mermaid enhancement enabled
- **WHEN** the Mermaid enhancement toggle is enabled
- **THEN** the Mermaid enhancement prompt is appended to the enhancement pipeline

#### Scenario: Mermaid enhancement disabled
- **WHEN** the Mermaid enhancement toggle is disabled
- **THEN** the Mermaid enhancement prompt is not appended to the enhancement pipeline

### Requirement: TODO List Enhancement Toggle
The system SHALL allow users to enable or disable TODO list generation and persist the setting locally.

#### Scenario: TODO list generation enabled
- **WHEN** the TODO list toggle is enabled
- **THEN** the TODO list enhancement prompt is appended to the enhancement pipeline

#### Scenario: TODO list generation disabled
- **WHEN** the TODO list toggle is disabled
- **THEN** the TODO list enhancement prompt is not appended to the enhancement pipeline

### Requirement: TODO List Prompt Format
The system SHALL instruct the model to output TODO lists using Markdown task list syntax so that the backend can detect and render structured TODO list messages.

#### Scenario: Markdown task list requested
- **WHEN** the TODO list enhancement prompt is appended
- **THEN** the model is instructed to use Markdown task list items with `- [ ]` style checkboxes in its TODO list
