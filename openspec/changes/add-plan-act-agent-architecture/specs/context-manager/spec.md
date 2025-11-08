# Context Manager Specification - Plan-Act Changes

## MODIFIED Requirements

### Requirement: Chat Configuration

The system SHALL store chat configuration including agent execution mode.

#### Scenario: Chat config includes agent mode

- **WHEN** creating or loading a chat context
- **THEN** config SHALL include `agent_mode` field
- **AND** field SHALL be enum: `Plan` or `Act`
- **AND** default for new chats SHALL be `Act` (backward compatible)
- **AND** default for existing chats without field SHALL be `Act`
- **AND** field SHALL persist across sessions

#### Scenario: Mode can be updated

- **WHEN** user switches agent mode
- **THEN** system SHALL update `agent_mode` in chat config
- **AND** save updated config to storage
- **AND** subsequent messages SHALL use new mode
- **AND** mode change SHALL be immediate (no restart required)

### Requirement: Message Structure

The system SHALL store message type for specialized rendering and handling.

#### Scenario: Message includes type field

- **WHEN** creating a message
- **THEN** message SHALL include `message_type` field
- **AND** field SHALL be enum: Text, Plan, Question, ToolCall, ToolResult
- **AND** default SHALL be `Text` for backward compatibility
- **AND** field SHALL be serialized to storage
- **AND** field SHALL be sent to frontend for rendering

#### Scenario: Message type determines rendering

- **WHEN** frontend receives a message
- **THEN** it SHALL check `message_type` field
- **AND** route to appropriate component:
  - `Text` → standard MessageCard
  - `Plan` → PlanMessageCard
  - `Question` → QuestionMessageCard
  - `ToolCall` → ToolCallCard (approval)
  - `ToolResult` → ToolResultCard (collapsed)

#### Scenario: Backward compatibility

- **WHEN** loading a message without `message_type` field
- **THEN** system SHALL default to `Text` type
- **AND** message SHALL display normally
- **AND** no migration SHALL be required

### Requirement: Context State Management

The system SHALL maintain chat state aware of agent mode for appropriate transitions.

#### Scenario: State transitions respect mode

- **WHEN** processing user message in Plan mode
- **THEN** state machine SHALL only transition to states valid for planning
- **AND** tool execution states SHALL NOT be entered
- **AND** plan parsing states SHALL be used
- **WHEN** processing user message in Act mode
- **THEN** state machine SHALL allow tool execution states
- **AND** question handling states SHALL be available


