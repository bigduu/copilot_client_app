# Tool System Specification - Plan-Act Changes

## MODIFIED Requirements

### Requirement: Tool Definition Structure

The system SHALL define tools with metadata including read-only flag for access control.

#### Scenario: Tool has read-only flag

- **WHEN** defining a tool
- **THEN** tool definition SHALL include `read_only: bool` field
- **AND** field SHALL indicate if tool only reads data (true) or can modify state (false)
- **AND** default value SHALL be `false` (write access)
- **AND** field SHALL be used for mode-based filtering

#### Scenario: Read-only tool examples

- **WHEN** classifying existing tools
- **THEN** the following SHALL be marked `read_only: true`:
  - `read_file` - reads file contents
  - `search_code` - searches codebase
  - `list_directory` - lists files
  - `grep` - searches text
  - `find_references` - finds symbol references
  - `get_file_info` - retrieves file metadata
- **AND** these SHALL be available in Plan mode

#### Scenario: Write tool examples

- **WHEN** classifying existing tools
- **THEN** the following SHALL be marked `read_only: false`:
  - `update_file` - modifies file contents
  - `create_file` - creates new files
  - `delete_file` - removes files
  - `rename_file` - renames files
  - `execute_command` - runs shell commands (can have side effects)
- **AND** these SHALL only be available in Act mode

#### Scenario: Tool filtering by mode

- **WHEN** generating tool list for LLM prompt
- **AND** chat is in Plan mode
- **THEN** system SHALL filter tools to only `read_only: true`
- **AND** write tools SHALL be excluded from prompt
- **WHEN** chat is in Act mode
- **THEN** system SHALL include all tools regardless of read_only flag








