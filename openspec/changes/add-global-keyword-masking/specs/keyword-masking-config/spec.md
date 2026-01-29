## ADDED Requirements

### Requirement: Persisted Global Keyword Masking Settings

The application SHALL store global keyword masking settings in the app settings store and load them at startup.

#### Scenario: Restore saved keyword masking settings

- **GIVEN** a user has saved global keyword masking entries
- **WHEN** the application restarts
- **THEN** the previously saved entries are loaded from app settings

#### Scenario: Default configuration

- **GIVEN** no keyword masking settings are stored
- **WHEN** the application loads settings
- **THEN** the keyword masking configuration defaults to an empty list

### Requirement: Keyword Entry Schema And Validation

The application SHALL store keyword masking entries with a pattern, match type (`exact` or `regex`), and enabled flag.

#### Scenario: Save exact keyword entry

- **GIVEN** a keyword entry with match type `exact`
- **WHEN** the entry is saved to settings
- **THEN** the stored configuration records the pattern and match type exactly as provided

#### Scenario: Reject invalid regex patterns

- **GIVEN** a keyword entry with match type `regex` and an invalid pattern
- **WHEN** the entry is saved to settings
- **THEN** the settings API rejects the update with a validation error
