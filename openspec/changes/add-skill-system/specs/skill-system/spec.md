# Skill System Specification

## Purpose

Provide a capability orchestration layer that bundles MCP tools, Workflows, and prompt fragments into reusable Skills. Skills enhance AI interactions by:
- Guiding LLM tool selection through contextual prompts
- Simplifying user capability discovery and activation
- Integrating with System Prompt to inject skill context

## ADDED Requirements

### Requirement: Skill Definition Storage

The system SHALL store skill definitions with the following fields:
- `id`: unique kebab-case identifier
- `name`: display name
- `description`: human-readable description
- `category`: classification for grouping
- `tags`: array of searchable tags
- `prompt`: context fragment injected into system prompt
- `tool_refs`: array of MCP tool references (format: "server::tool")
- `workflow_refs`: array of workflow names
- `visibility`: "public" or "private"
- `enabled_by_default`: boolean
- `version`: semantic version string
- `created_at`, `updated_at`: ISO 8601 timestamps

#### Scenario: Create custom skill

- **WHEN** the frontend submits a new skill definition to POST /v1/skills
- **THEN** the backend validates required fields, generates id if missing, and persists the skill

#### Scenario: Update existing skill

- **WHEN** the frontend submits updates to PUT /v1/skills/{id}
- **THEN** the backend merges changes, updates `updated_at`, and persists

### Requirement: Skill Enablement

The system SHALL support enabling/disabling skills at global and per-chat levels.

#### Scenario: Global enable

- **WHEN** the user enables a skill globally
- **THEN** the skill is added to `enabled_skill_ids` and affects all future chats

#### Scenario: Per-chat override

- **WHEN** the user enables a skill for a specific chat
- **THEN** the skill is added to `chat_overrides[chatId]` without affecting global state

#### Scenario: Disable precedence

- **WHEN** a skill is globally enabled but disabled for a specific chat
- **THEN** the per-chat disable takes precedence for that chat

### Requirement: System Prompt Integration

The system SHALL inject enabled skill context into the system prompt sent to LLMs.

#### Scenario: Build system prompt with skills

- **GIVEN** a chat session with enabled skills
- **WHEN** the backend builds the system prompt for an LLM request
- **THEN** it appends a "## Available Skills" section containing:
  - Skill name and description
  - Skill prompt fragment
  - Optionally: referenced tools and workflows

#### Scenario: Tool filtering by skills

- **GIVEN** enabled skills with specific `tool_refs`
- **WHEN** the LLM requests available tools
- **THEN** only tools referenced by enabled skills are offered (optional mode)

### Requirement: Skill Management API

The system SHALL expose HTTP endpoints for skill CRUD and enablement operations.

#### Scenario: List skills

- **WHEN** the frontend calls GET /v1/skills
- **THEN** it receives all skill definitions with their enablement status

#### Scenario: Get skill detail

- **WHEN** the frontend calls GET /v1/skills/{id}
- **THEN** it receives the full skill definition including all fields

#### Scenario: Query available dependencies

- **WHEN** the frontend calls GET /v1/skills/available-tools
- **THEN** it receives the list of MCP tools for skill editor selection

- **WHEN** the frontend calls GET /v1/skills/available-workflows
- **THEN** it receives the list of workflows for skill editor selection

### Requirement: Built-in Skills

The system SHALL ship with pre-defined built-in skills as examples and common use cases.

#### Scenario: First launch

- **WHEN** the application starts and no skills exist
- **THEN** the system auto-creates built-in skills (File Analysis, Code Review, etc.)

#### Scenario: Built-in skill protection

- **GIVEN** a built-in skill
- **WHEN** the user attempts to delete it
- **THEN** the system allows deletion (optional: with confirmation)

### Requirement: Frontend Skill Manager

The system SHALL provide a UI for managing skills.

#### Scenario: Browse skills

- **WHEN** the user navigates to the Skill Manager page
- **THEN** they see a grid/list of skills with search and filter capabilities

#### Scenario: Edit skill

- **WHEN** the user clicks on a skill
- **THEN** the Skill Editor opens with the skill definition

#### Scenario: Enable from manager

- **WHEN** the user toggles enable on a skill in Skill Manager
- **THEN** the skill is enabled globally and System Prompt is updated

### Requirement: Chat-level Skill Selector

The system SHALL allow per-chat skill configuration.

#### Scenario: Open chat config

- **WHEN** the user opens chat configuration/settings
- **THEN** they see a Skill Selector showing global skills with per-chat override options

#### Scenario: Override for chat

- **WHEN** the user enables a skill in the chat config
- **THEN** that skill applies only to the current chat

### Requirement: Skill Import/Export

The system SHALL support importing and exporting skill definitions as JSON.

#### Scenario: Export skill

- **WHEN** the user clicks "Export" in Skill Editor
- **THEN** a JSON file containing the skill definition is downloaded

#### Scenario: Import skill

- **WHEN** the user imports a skill JSON file
- **THEN** the skill is created or updated (matching by id)
