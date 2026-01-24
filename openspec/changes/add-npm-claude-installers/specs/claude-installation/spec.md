## ADDED Requirements
### Requirement: Installer Crate Interface
The system SHALL expose npm detection and install operations via a reusable Rust crate named `claude_installer`.

#### Scenario: Backend invokes installer crate
- **WHEN** the backend needs to detect npm or run an install
- **THEN** it calls the `claude_installer` interface rather than inlining npm logic

### Requirement: HTTP Install API
The system SHALL expose HTTP endpoints under `/v1/claude/install` for npm detection and install actions.

#### Scenario: Detect npm via HTTP
- **WHEN** the frontend requests `/v1/claude/install/npm/detect`
- **THEN** the system returns npm availability, path, and version

#### Scenario: Trigger npm install via HTTP
- **WHEN** the frontend requests `/v1/claude/install/npm/install` with the target package and scope
- **THEN** the system executes the install and streams output to the client

### Requirement: NPM Installer Configuration
The system SHALL allow users to configure npm package names for Claude Code and Claude Code router and choose an install scope (global or project-local).

#### Scenario: Configure package names and scope
- **WHEN** the user saves installer settings
- **THEN** the settings are persisted and used for subsequent install actions

### Requirement: Default Installer Settings
The system SHALL provide default installer settings with global scope and placeholder npm package names for Claude Code and Claude Code router so the agent page can trigger installs without prior configuration.

#### Scenario: Default configuration available
- **WHEN** the user opens the agent page or installer settings for the first time
- **THEN** global scope and placeholder package names are pre-populated

### Requirement: NPM Availability Check
The system SHALL provide an npm availability check that reports the resolved npm path and version.

#### Scenario: npm detected
- **WHEN** npm is available on PATH
- **THEN** the system reports npm path and version

#### Scenario: npm missing
- **WHEN** npm is not available on PATH
- **THEN** the system reports that npm is unavailable and blocks install actions

### Requirement: Claude Code Install via npm
The system SHALL allow users to install Claude Code via npm using the configured package name and chosen scope.

#### Scenario: Install Claude Code (global)
- **WHEN** the user selects global scope and confirms install
- **THEN** the system runs the npm install command and streams output to the UI

#### Scenario: Install Claude Code (project-local)
- **WHEN** the user selects project-local scope and confirms install
- **THEN** the system runs the npm install command scoped to the project directory and streams output to the UI

### Requirement: Claude Code Router Install via npm
The system SHALL allow users to install Claude Code router via npm using the configured package name and chosen scope.

#### Scenario: Install Claude Code router
- **WHEN** the user confirms router install
- **THEN** the system runs the npm install command and streams output to the UI

### Requirement: Install Feedback and Errors
The system SHALL surface install progress, stdout/stderr output, and a final success or error state for npm installs.

#### Scenario: Install succeeds
- **WHEN** npm exits successfully
- **THEN** the UI shows a success state and stores the last install timestamp

#### Scenario: Install fails
- **WHEN** npm exits with a non-zero status
- **THEN** the UI shows the error output and suggested next steps

### Requirement: Update Guidance
The system SHALL present update guidance in the installer UI and indicate that updates require manual npm usage until an update command is implemented.

#### Scenario: Update guidance shown
- **WHEN** the user views the installer UI
- **THEN** the UI shows how to update via npm and notes that updates are not yet automated
