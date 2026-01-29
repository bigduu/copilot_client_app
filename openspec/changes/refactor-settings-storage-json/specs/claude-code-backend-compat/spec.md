## MODIFIED Requirements

### Requirement: Claude Binary Discovery And Selection

The application SHALL discover available Claude Code installations and persist a user-selected binary path in `~/.bodhi/config.json` under `claude.binary_path`.

#### Scenario: Discover installations

- **WHEN** the frontend requests available Claude installations
- **THEN** the backend returns discovered installations with version metadata

#### Scenario: Persist a preferred binary

- **WHEN** the frontend sets a Claude binary path
- **THEN** the backend stores it in `~/.bodhi/config.json` under `claude.binary_path`
- **AND** subsequent executions use the stored path when it is valid
