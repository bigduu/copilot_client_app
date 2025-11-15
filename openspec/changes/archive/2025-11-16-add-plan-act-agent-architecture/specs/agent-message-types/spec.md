# Agent Message Types Specification

## ADDED Requirements

### Requirement: Message Type System

The system SHALL support multiple message types with distinct rendering and handling logic.

#### Scenario: Message has explicit type

- **WHEN** a message is created by the system
- **THEN** it SHALL have a `message_type` field
- **AND** the type SHALL be one of: Text, Plan, Question, ToolCall, ToolResult
- **AND** the type SHALL be serialized to/from storage

#### Scenario: Backward compatibility with old messages

- **WHEN** loading a message without `message_type` field
- **THEN** the system SHALL default to `message_type = Text`
- **AND** the message SHALL display normally
- **AND** no errors SHALL occur

### Requirement: Plan Message Type

The system SHALL support structured execution plans as a distinct message type.

#### Scenario: Agent outputs a plan

- **WHEN** agent is in Plan mode and generates a plan
- **THEN** the system SHALL parse the JSON plan from response
- **AND** set `message_type = Plan`
- **AND** store the plan structure in message content
- **AND** frontend SHALL render as PlanMessageCard

#### Scenario: Plan structure validation

- **WHEN** parsing a plan from agent response
- **THEN** the plan SHALL contain: `goal`, `steps` array
- **AND** each step SHALL contain: `step_number`, `action`, `reason`
- **AND** optional fields MAY include: `tools_needed`, `estimated_time`, `risks`
- **AND** invalid plans SHALL fallback to Text type

#### Scenario: Plan display in frontend

- **WHEN** frontend receives a Plan message
- **THEN** it SHALL render a structured card with:
  - Goal prominently displayed
  - Numbered steps in clean list
  - Tools needed for each step (if provided)
  - Risks highlighted (if provided)
  - "Execute Plan" button
  - "Refine Plan" button

### Requirement: Question Message Type

The system SHALL support structured questions with predefined answer options.

#### Scenario: Agent asks a question

- **WHEN** agent needs user input during execution
- **THEN** the system SHALL parse the JSON question from response
- **AND** set `message_type = Question`
- **AND** store the question structure in message content
- **AND** frontend SHALL render as QuestionMessageCard

#### Scenario: Question structure validation

- **WHEN** parsing a question from agent response
- **THEN** the question SHALL contain: `question` text, `options` array
- **AND** each option SHALL contain: `label`, `value`
- **AND** optional fields MAY include: `context`, `severity`, `default`
- **AND** invalid questions SHALL fallback to Text type

#### Scenario: Question interaction in frontend

- **WHEN** frontend receives a Question message
- **THEN** it SHALL render interactive buttons for each option
- **AND** clicking an option SHALL send answer to backend
- **AND** buttons SHALL be disabled after answer submitted
- **AND** backend SHALL append answer as user message
- **AND** agent execution SHALL resume with answer

#### Scenario: Question severity levels

- **WHEN** a question has severity level
- **THEN** frontend SHALL style based on severity:
  - `critical`: Red/warning colors
  - `major`: Orange/attention colors
  - `minor`: Default colors
- **AND** help user prioritize responses

### Requirement: Tool Call Message Type

The system SHALL support tool call messages for approval workflows.

#### Scenario: Tool requires approval

- **WHEN** agent attempts to call a tool with `requires_approval = true`
- **THEN** the system SHALL set `message_type = ToolCall`
- **AND** store tool name and parameters
- **AND** frontend SHALL render approval card
- **AND** wait for user approval before execution

### Requirement: Tool Result Message Type

The system SHALL support tool result messages for execution feedback.

#### Scenario: Tool execution completes

- **WHEN** a tool finishes execution
- **THEN** the system SHALL set `message_type = ToolResult`
- **AND** store the tool output
- **AND** frontend MAY render inline or collapsed
- **AND** result SHALL be available in chat history

### Requirement: Message Type Extensibility

The system SHALL allow adding new message types in the future without breaking changes.

#### Scenario: Unknown message type

- **WHEN** frontend receives an unknown message_type
- **THEN** it SHALL fallback to Text rendering
- **AND** log a warning for debugging
- **AND** NOT crash or error

#### Scenario: New message type added

- **WHEN** a new message type is introduced
- **THEN** it SHALL be added to MessageType enum
- **AND** appropriate parser SHALL be implemented
- **AND** frontend component SHALL be created
- **AND** routing logic SHALL be updated
- **AND** old clients SHALL gracefully handle unknown type








