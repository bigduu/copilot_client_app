## ADDED Requirements

### Requirement: Configurable Backend API Base URL
The system SHALL allow the user to configure the backend API base URL used by the frontend for backend HTTP requests.

#### Scenario: Persist and apply custom backend URL
- **WHEN** the user sets the backend API base URL to a valid URL and saves it
- **THEN** the frontend uses the saved base URL for subsequent backend requests
- **AND** the saved base URL persists across application restarts

### Requirement: Default Backend API Base URL
The system SHALL determine the backend API base URL using the following precedence: user-saved value, then build-time `VITE_BACKEND_BASE_URL`, then `http://127.0.0.1:8080/v1`.

#### Scenario: Use default when no user override exists
- **GIVEN** no user-saved backend API base URL exists
- **WHEN** the frontend issues a backend request
- **THEN** the request uses `VITE_BACKEND_BASE_URL` when it is defined
- **AND** otherwise uses `http://127.0.0.1:8080/v1`

### Requirement: URL Normalization
The system SHALL normalize the configured backend API base URL by trimming whitespace and removing a trailing `/`.

#### Scenario: Normalize a trailing slash
- **WHEN** the user saves `http://localhost:8080/v1/`
- **THEN** the stored value is `http://localhost:8080/v1`
