## ADDED Requirements

### Requirement: Keyword Masking Settings UI

The settings UI SHALL allow users to add, edit, enable/disable, and remove global keyword masking entries.

#### Scenario: Add a new keyword entry

- **GIVEN** the user opens the keyword masking settings
- **WHEN** the user adds a new entry with a pattern and match type
- **THEN** the entry appears in the list and is saved to settings

#### Scenario: Toggle keyword masking entry

- **GIVEN** an existing keyword masking entry
- **WHEN** the user toggles its enabled state
- **THEN** the UI updates the list and persists the change

#### Scenario: Remove keyword entry

- **GIVEN** an existing keyword masking entry
- **WHEN** the user deletes it
- **THEN** the entry is removed from the list and settings are updated

### Requirement: Validation Feedback In UI

The settings UI SHALL display validation errors returned by the settings API.

#### Scenario: Invalid regex entered in UI

- **GIVEN** the user enters an invalid regex pattern
- **WHEN** the user saves the entry
- **THEN** the UI displays the validation error and keeps the unsaved changes visible
