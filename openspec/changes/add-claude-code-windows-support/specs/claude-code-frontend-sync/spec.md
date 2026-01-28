## MODIFIED Requirements

### Requirement: Opcode-Style Stream Synchronization

The Agent UI SHALL display project names and paths correctly for Windows projects.

#### Scenario: Render Windows project labels

- **GIVEN** a project path that uses Windows separators (for example, `C:\\Users\\me\\repo`)
- **WHEN** the UI renders project names or tab labels
- **THEN** it derives the project name using either `/` or `\\` separators without corrupting the path

#### Scenario: Derive project IDs for Windows

- **GIVEN** a Windows project path
- **WHEN** the UI derives a project ID for backend calls
- **THEN** it uses the same encoding rules as the backend so the project is found consistently
