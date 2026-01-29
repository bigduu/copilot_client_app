## ADDED Requirements

### Requirement: App Settings JSON Storage

The application SHALL persist app settings as JSON files under `~/.bodhi`, storing Claude settings in `config.json` under `claude` and keyword masking entries in `keyword_masking.json`.

#### Scenario: Load defaults when files are missing

- **GIVEN** `~/.bodhi/config.json` and `~/.bodhi/keyword_masking.json` do not exist
- **WHEN** the application loads settings
- **THEN** Claude settings are treated as unset
- **AND** keyword masking entries default to an empty list

#### Scenario: Update Claude settings without clobbering other keys

- **GIVEN** `~/.bodhi/config.json` contains unrelated settings
- **WHEN** the user saves a Claude binary path
- **THEN** the backend updates `claude.binary_path` and preserves other keys

#### Scenario: Persist keyword masking entries

- **GIVEN** the user saves keyword masking entries
- **WHEN** the backend persists the configuration
- **THEN** `~/.bodhi/keyword_masking.json` contains the entries in the submitted order
