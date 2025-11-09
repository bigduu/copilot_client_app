# Agent Role System Specification

## ADDED Requirements

### Requirement: Role-Based Agent Execution

The system SHALL support multiple agent roles with distinct permissions and behaviors.

#### Scenario: Agent has active role

- **WHEN** processing a chat message
- **THEN** system SHALL determine agent's current role
- **AND** role SHALL be one of: Planner, Actor (extensible to more)
- **AND** role SHALL define available tools and permissions
- **AND** role SHALL determine system prompt template

#### Scenario: Role stored in context

- **WHEN** chat context is created or loaded
- **THEN** context config SHALL include `agent_role` field
- **AND** field SHALL be enum type (not string)
- **AND** default for new chats SHALL be Actor (backward compatible)
- **AND** role SHALL persist across sessions

#### Scenario: Role extensibility

- **WHEN** defining a new agent role in the future
- **THEN** system SHALL support adding to AgentRole enum
- **AND** each role SHALL define its permissions
- **AND** each role SHALL have dedicated system prompt
- **AND** existing chats SHALL continue working
- **AND** no breaking changes to core architecture

### Requirement: Role Permission System

The system SHALL define granular permissions for each agent role.

#### Scenario: Role defines permissions

- **WHEN** a role is defined
- **THEN** it SHALL specify permission set:
  ```rust
  struct RolePermissions {
    can_read_files: bool,
    can_write_files: bool,
    can_delete_files: bool,
    can_execute_commands: bool,
    can_create_files: bool,
  }
  ```
- **AND** permissions SHALL be enforced at tool access level
- **AND** attempting forbidden operation SHALL be rejected

#### Scenario: Planner role permissions

- **WHEN** agent has Planner role
- **THEN** permissions SHALL be:
  - `can_read_files: true`
  - `can_write_files: false`
  - `can_delete_files: false`
  - `can_execute_commands: false`
  - `can_create_files: false`
- **AND** only read-only tools SHALL be available

#### Scenario: Actor role permissions

- **WHEN** agent has Actor role
- **THEN** permissions SHALL be:
  - `can_read_files: true`
  - `can_write_files: true`
  - `can_delete_files: true`
  - `can_execute_commands: true`
  - `can_create_files: true`
- **AND** all tools SHALL be available (subject to individual tool approval settings)

#### Scenario: Future role examples

- **WHEN** adding new roles in future
- **THEN** examples MAY include:
  - **Commander**: Can read, cannot modify, can orchestrate other roles
  - **Designer**: Can read and create, cannot delete
  - **Reviewer**: Can read only, outputs structured feedback
  - **Tester**: Can read and execute (for testing), cannot modify source
- **AND** each SHALL have tailored permission set

### Requirement: Role-Based Tool Filtering

The system SHALL filter available tools based on current role's permissions.

#### Scenario: Filter tools by role permissions

- **WHEN** generating tool list for LLM prompt
- **THEN** system SHALL check each tool's required permissions
- **AND** include tool only if role has ALL required permissions
- **AND** excluded tools SHALL NOT appear in prompt
- **AND** LLM SHALL NOT be able to call excluded tools

#### Scenario: Tool defines required permissions

- **WHEN** defining a tool
- **THEN** tool SHALL specify required permissions:
  ```rust
  struct ToolDefinition {
    name: String,
    required_permissions: Vec<Permission>,
    // e.g., [Permission::ReadFiles, Permission::WriteFiles]
  }
  ```
- **AND** multiple permissions can be required
- **AND** role must have ALL to access tool

#### Scenario: Permission enforcement

- **WHEN** agent attempts to call a tool
- **THEN** system SHALL verify role has required permissions
- **AND** if permitted, execute tool normally
- **AND** if not permitted, reject with clear error message
- **AND** error SHALL NOT be retryable (security boundary)

### Requirement: Role-Specific System Prompts

The system SHALL inject role-specific instructions into system prompt.

#### Scenario: Planner role prompt

- **WHEN** generating system prompt for Planner role
- **THEN** prompt SHALL include:
  - "You are operating in PLANNER role"
  - Description of planning responsibilities
  - Read-only permission reminders
  - Plan output format specification
  - Guidance on thoroughness and discussion
- **AND** emphasize exploration and analysis
- **AND** explain transition to Actor role

#### Scenario: Actor role prompt

- **WHEN** generating system prompt for Actor role
- **THEN** prompt SHALL include:
  - "You are operating in ACTOR role"
  - Description of execution responsibilities
  - Full permission set availability
  - Autonomy guidelines (when to ask vs proceed)
  - Question output format specification
- **AND** emphasize executing approved plan
- **AND** explain when to ask for approval

#### Scenario: Future role prompt templates

- **WHEN** adding a new role
- **THEN** system SHALL provide template mechanism
- **AND** role SHALL have dedicated prompt file/section
- **AND** prompt SHALL be injected based on active role
- **AND** prompts SHALL NOT conflict or overlap

### Requirement: Role Switching

The system SHALL allow users to explicitly switch agent roles.

#### Scenario: User switches role

- **WHEN** user wants to change agent role
- **THEN** UI SHALL provide role selector
- **AND** clicking role SHALL send update to backend
- **AND** backend SHALL update chat config
- **AND** subsequent messages SHALL use new role
- **AND** role change SHALL be logged in chat history

#### Scenario: Role switch validation

- **WHEN** switching from Actor to Planner
- **AND** there is ongoing tool execution
- **THEN** system MAY show confirmation dialog
- **AND** warn that execution will stop
- **AND** proceed only on user confirmation

#### Scenario: Role persistence

- **WHEN** user closes and reopens chat
- **THEN** chat SHALL resume with last active role
- **AND** role SHALL be loaded from stored config

### Requirement: Role Display in UI

The system SHALL clearly indicate current agent role to users.

#### Scenario: Role indicator

- **WHEN** user views a chat
- **THEN** UI SHALL display current role prominently
- **AND** use role-specific styling:
  - Planner: Blue theme, magnifying glass icon
  - Actor: Green theme, lightning bolt icon
- **AND** show tooltip explaining role on hover
- **AND** provide quick access to role switcher

#### Scenario: Role in message history

- **WHEN** displaying message history
- **THEN** each assistant message MAY indicate which role sent it
- **AND** use role-specific avatar or badge
- **AND** help user understand role transitions

### Requirement: Backward Compatibility

The system SHALL maintain compatibility with existing chats that don't have role concept.

#### Scenario: Load chat without role field

- **WHEN** loading a chat created before role system
- **THEN** system SHALL default to Actor role
- **AND** chat SHALL function normally
- **AND** user CAN switch to other roles if desired
- **AND** role SHALL be saved on next update

#### Scenario: Migration strategy

- **WHEN** deploying role system
- **THEN** existing chats SHALL NOT require migration
- **AND** role field SHALL be added on first access
- **AND** default SHALL match previous behavior (full permissions)

## Future Role Examples

### Commander Role (Example)

**Purpose**: High-level orchestration and delegation
**Permissions**:

- `can_read_files: true`
- `can_write_files: false`
- `can_delegate_to_roles: [Planner, Actor]`
  **Behavior**: Creates plans and delegates to other roles

### Designer Role (Example)

**Purpose**: Create new structures (files, components, modules)
**Permissions**:

- `can_read_files: true`
- `can_write_files: false`
- `can_create_files: true`
  **Behavior**: Designs and creates new artifacts, cannot modify existing

### Reviewer Role (Example)

**Purpose**: Code review and feedback
**Permissions**:

- `can_read_files: true`
- All write permissions: false
  **Behavior**: Analyzes code, outputs structured review feedback

### Tester Role (Example)

**Purpose**: Run tests and verify behavior
**Permissions**:

- `can_read_files: true`
- `can_execute_commands: true` (for running tests)
- `can_write_files: false`
  **Behavior**: Executes tests, reports results, cannot modify source






