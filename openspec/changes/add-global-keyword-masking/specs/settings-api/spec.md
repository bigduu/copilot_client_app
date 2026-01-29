## ADDED Requirements

### Requirement: Keyword Masking Settings Commands

The backend SHALL expose Tauri commands to read and update the global keyword masking configuration.

#### Scenario: Fetch keyword masking configuration

- **GIVEN** keyword masking settings exist in app settings
- **WHEN** the frontend invokes the settings read command
- **THEN** the backend returns the current list of keyword entries

#### Scenario: Persist updated keyword masking configuration

- **GIVEN** the frontend submits an updated list of keyword entries
- **WHEN** the settings update command is invoked
- **THEN** the backend validates and persists the configuration
- **AND** returns the stored configuration

### Requirement: Regex Validation Feedback

The backend SHALL validate regex keyword entries and return actionable errors when validation fails.

#### Scenario: Invalid regex entry submission

- **GIVEN** the frontend submits a keyword entry with match type `regex` and an invalid pattern
- **WHEN** the settings update command is invoked
- **THEN** the backend returns an error indicating which entry failed validation
