## ADDED Requirements
### Requirement: Endpoint and command map
The system SHALL maintain a single map of supported HTTP endpoints and Tauri commands, including owning modules and request/response shapes.

#### Scenario: Contract update
- **WHEN** a new endpoint or command is introduced
- **THEN** the map is updated in the same change

### Requirement: Backward compatible contracts
The system SHALL keep existing HTTP endpoint paths, methods, and response envelopes backward compatible, and SHALL keep existing Tauri command names and parameter shapes callable.

#### Scenario: Internal storage refactor
- **WHEN** internal storage is refactored
- **THEN** existing endpoint and command behavior remains compatible

### Requirement: Centralized invocation layer
The frontend SHALL invoke backend endpoints and Tauri commands through a centralized adapter layer, not ad-hoc `fetch`/`invoke` calls inside UI components.

#### Scenario: Component needs backend data
- **WHEN** a UI component needs data or a command result
- **THEN** it calls the adapter API rather than using `fetch`/`invoke` directly
