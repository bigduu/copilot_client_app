# backend-config Specification (Delta)

## ADDED Requirements

### Requirement: Config form for supported keys

The system SHALL present form inputs for each supported config key and keep those values in sync with the underlying config JSON.

#### Scenario: Edit config via form inputs

- **GIVEN** the user opens System Settings → Config
- **WHEN** they edit `http_proxy`, `https_proxy`, `api_key`, `api_base`, `model`, or `headless_auth` via form controls
- **THEN** the Config JSON view reflects the same values
- **AND** saving persists the updated configuration

### Requirement: Advanced JSON editor is collapsible

The system SHALL keep the JSON editor available as a collapsible advanced section.

#### Scenario: Use advanced JSON editor

- **GIVEN** the user opens the advanced JSON section
- **WHEN** they edit JSON to valid values
- **THEN** the form fields update to match the JSON

### Requirement: Model selection in Config form

The system SHALL expose model selection within the Config form using the existing model dropdown list.

#### Scenario: Choose a model from the Config tab

- **GIVEN** available model options are loaded
- **WHEN** the user selects a model in the Config form
- **THEN** the selection is reflected in the config values
