# Skill System Specification

## MODIFIED Requirements

### Requirement: Skill Definition Storage

The system SHALL store each skill as a Markdown file with YAML frontmatter under `~/.bodhi/skills/*.md`.
The YAML frontmatter SHALL include:
- `id`: unique kebab-case identifier (MUST match the filename)
- `name`: display name
- `description`: human-readable description
- `category`: classification for grouping
- `tags`: array of searchable tags
- `tool_refs`: array of MCP tool references (format: "server::tool" or "tool")
- `workflow_refs`: array of workflow names
- `visibility`: "public" or "private"
- `enabled_by_default`: boolean
- `version`: semantic version string
- `created_at`, `updated_at`: ISO 8601 timestamps
The Markdown body SHALL be used as the skill prompt content.
The system SHALL NOT require `skills.json` for skill definitions.

#### Scenario: Load skills on startup

- **WHEN** the application or agent service starts
- **THEN** it loads all valid `~/.bodhi/skills/*.md` files and extracts frontmatter and prompt body

#### Scenario: Skip invalid skill files

- **WHEN** a skill file is missing required frontmatter fields
- **THEN** the system skips the file and logs a warning

### Requirement: Skill Enablement

The system SHALL derive skill enablement exclusively from `enabled_by_default` in the Markdown frontmatter.
The system SHALL NOT maintain a separate enablement store for skills.

#### Scenario: Disabled skill excluded

- **GIVEN** a skill with `enabled_by_default: false`
- **WHEN** the system builds the tool list or system prompt
- **THEN** the skill is excluded from the available tools and prompt context

### Requirement: Skill Management API

The system SHALL expose read-only endpoints for skills (list and detail).
Write endpoints (create, update, delete, enable, disable) SHALL be disabled.

#### Scenario: List skills

- **WHEN** the frontend calls GET /v1/skills
- **THEN** it receives skills loaded from Markdown files

#### Scenario: Attempt to modify skills

- **WHEN** the frontend calls POST/PUT/DELETE or enable/disable endpoints
- **THEN** the server responds with an error indicating read-only mode

### Requirement: Frontend Skill Manager

The system SHALL provide a view-only UI for skills.

#### Scenario: Browse skills

- **WHEN** the user navigates to the Skill Manager page
- **THEN** they see a list of skills loaded from Markdown without edit controls

### Requirement: Skill Import/Export

The system SHALL support exporting skills as Markdown files and SHALL NOT support skill import.

#### Scenario: Export skill

- **WHEN** the user triggers export
- **THEN** the system provides the Markdown content for the selected skill

#### Scenario: Import blocked

- **WHEN** the user attempts to import a skill
- **THEN** the system rejects the action as unsupported in read-only mode
