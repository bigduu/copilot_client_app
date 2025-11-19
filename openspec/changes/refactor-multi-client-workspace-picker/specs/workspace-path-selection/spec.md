## ADDED Requirements

### Requirement: HTTP-Based Folder Selection

The system SHALL provide an HTTP API endpoint for folder selection that uses native system dialogs through the Rust backend, enabling all clients (Web, Tauri, CLI) to access folder selection capabilities uniformly.

#### Scenario: Successful folder selection

- **WHEN** a client sends a POST request to `/v1/workspace/pick-folder`
- **THEN** the system opens a native folder selection dialog
- **AND** returns the selected folder path in the response body with status "success"

#### Scenario: User cancels folder selection

- **WHEN** a client sends a POST request to `/v1/workspace/pick-folder`
- **AND** the user cancels the native dialog
- **THEN** the system returns a response with status "cancelled" and no path

#### Scenario: Native dialog unavailable

- **WHEN** a client sends a POST request to `/v1/workspace/pick-folder`
- **AND** native dialog cannot be opened (e.g., headless environment)
- **THEN** the system returns status "info" with suggested common workspace directories
- **AND** provides instructions for manual path entry

### Requirement: Multi-Client Compatibility

The folder selection API SHALL be accessible from any HTTP client, not restricted to specific platforms or frameworks.

#### Scenario: Web client calls folder selection

- **WHEN** a web browser client calls `/v1/workspace/pick-folder` via fetch/axios
- **THEN** the backend opens the native dialog
- **AND** returns the result in a standard HTTP response

#### Scenario: Tauri client calls folder selection

- **WHEN** a Tauri desktop client calls `/v1/workspace/pick-folder` via HTTP
- **THEN** the backend opens the native dialog
- **AND** returns the result in a standard HTTP response
- **AND** the behavior is identical to the web client

### Requirement: Graceful Degradation

The system SHALL provide alternative paths for folder selection when native dialogs are not available.

#### Scenario: Fallback to suggested directories

- **WHEN** native dialog fails to open
- **THEN** the system returns a list of common workspace directories based on the operating system
- **AND** includes directories like ~/Desktop, ~/Documents, ~/Projects

#### Scenario: Platform-specific suggestions

- **WHEN** running on macOS
- **THEN** suggested paths include `/Users/{username}/Desktop`, `/Users/{username}/Documents`
- **WHEN** running on Windows
- **THEN** suggested paths include `C:\Users\{username}\Desktop`, `C:\Users\{username}\Documents`
- **WHEN** running on Linux
- **THEN** suggested paths include `/home/{username}/Desktop`, `/home/{username}/Documents`

### Requirement: Frontend Integration

The frontend components SHALL interact with the backend folder selection API exclusively through HTTP, removing direct dependencies on platform-specific APIs.

#### Scenario: WorkspacePicker uses HTTP API

- **WHEN** user clicks the browse button in WorkspacePicker
- **THEN** the component sends HTTP POST to `/v1/workspace/pick-folder`
- **AND** displays loading state while waiting for response
- **AND** updates the input field with the selected path on success

#### Scenario: Auto-close behavior

- **WHEN** user successfully selects a folder path
- **THEN** the selection dialog or info message automatically closes
- **AND** the selected path is populated in the workspace input field

## REMOVED Requirements

### Requirement: Tauri Command-Based Folder Selection

**Reason**: This approach violates the architectural principle of Rust backend as the core. Tauri commands lock functionality to a single client type, preventing reuse by web or other clients.

**Migration**: Replace all `invoke("pick_folder")` calls with HTTP POST requests to `/v1/workspace/pick-folder`. The backend provides the same native dialog functionality through HTTP API.

The following Tauri command implementation is deprecated:

```rust
// src-tauri/src/command/file_picker.rs
#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String>
```

Frontend code using `@tauri-apps/plugin-dialog` should be refactored to use the unified HTTP API approach.
