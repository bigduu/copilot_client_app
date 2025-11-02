# Plan-Act Agent Architecture Specification

## ADDED Requirements

### Requirement: Two-Phase Agent Execution
The system SHALL support two distinct agent modes: Plan mode (read-only planning) and Act mode (execution with autonomy).

#### Scenario: Plan mode for exploration
- **WHEN** user creates or switches to Plan mode
- **THEN** agent SHALL have access to read-only tools only
- **AND** agent SHALL analyze and create execution plans
- **AND** agent SHALL NOT modify any files or state
- **AND** agent CAN read files, search code, list directories
- **AND** plans SHALL be reviewed by user before execution

#### Scenario: Act mode for execution
- **WHEN** user switches to Act mode (after plan approval)
- **THEN** agent SHALL have access to all tools (read and write)
- **AND** agent SHALL execute the approved plan
- **AND** agent MAY make small adjustments autonomously
- **AND** agent MUST ask for approval on major changes
- **AND** agent SHALL continue until plan complete or blocked

#### Scenario: Clear mode indicator
- **WHEN** user is in a chat
- **THEN** UI SHALL clearly show current mode (Plan or Act)
- **AND** show mode description on hover
- **AND** update indicator when mode changes
- **AND** use distinct visual styling for each mode

### Requirement: Manual Mode Switching
The system SHALL require explicit user action to switch between Plan and Act modes.

#### Scenario: User switches from Plan to Act
- **WHEN** user has reviewed a plan in Plan mode
- **THEN** user can click "Execute Plan" button
- **AND** system SHALL switch chat to Act mode
- **AND** backend SHALL update chat config
- **AND** subsequent messages SHALL use Act mode prompts and tools
- **AND** no automatic execution SHALL occur without this explicit switch

#### Scenario: User switches from Act to Plan
- **WHEN** user wants to stop execution and replan
- **THEN** user can manually switch to Plan mode
- **AND** system SHALL show confirmation dialog (work in progress will stop)
- **AND** chat SHALL switch to Plan mode on confirmation
- **AND** subsequent messages SHALL use Plan mode restrictions

#### Scenario: Mode persists across sessions
- **WHEN** user closes and reopens a chat
- **THEN** the chat SHALL remember the last active mode
- **AND** continue in that mode for new messages

### Requirement: Plan Generation and Structure
The system SHALL output structured execution plans in JSON format with clear steps and reasoning.

#### Scenario: Agent generates a plan
- **WHEN** agent is in Plan mode and user requests an action
- **THEN** agent SHALL analyze the request
- **AND** read necessary files using read-only tools
- **AND** output a JSON plan with structure:
  ```json
  {
    "goal": "Clear objective statement",
    "steps": [
      {
        "step_number": 1,
        "action": "What will be done",
        "reason": "Why this is necessary",
        "tools_needed": ["list", "of", "tools"],
        "estimated_time": "rough estimate"
      }
    ],
    "estimated_total_time": "total estimate",
    "risks": ["potential issues"],
    "prerequisites": ["things user should prepare"]
  }
  ```
- **AND** plan SHALL be parseable and displayable
- **AND** plan SHALL contain at least goal and steps

#### Scenario: Multi-round plan refinement
- **WHEN** user provides feedback on a plan
- **THEN** agent SHALL revise the plan based on feedback
- **AND** output an updated plan
- **AND** user MAY iterate multiple times before approval
- **AND** each plan SHALL be a new message in history

#### Scenario: Plan validation
- **WHEN** system receives agent response in Plan mode
- **THEN** system SHALL attempt to parse as JSON plan
- **AND** validate required fields (goal, steps)
- **AND** on success, mark as Plan message type
- **AND** on failure, fallback to Text message type
- **AND** display plan if valid, plain text if not

### Requirement: Autonomous Execution with Approval Gates
The system SHALL allow agent autonomy during execution while requiring approval for major changes.

#### Scenario: Small adjustments without approval
- **WHEN** agent is executing in Act mode
- **AND** encounters minor variations from plan (formatting, whitespace, obvious fixes)
- **THEN** agent SHALL proceed autonomously
- **AND** mention the adjustment in response
- **AND** NOT stop for approval

#### Scenario: Major changes require approval
- **WHEN** agent encounters significant deviation from plan
- **OR** needs to delete files
- **OR** needs to make major refactoring
- **OR** is uncertain about approach
- **THEN** agent SHALL output a Question message
- **AND** execution SHALL pause
- **AND** wait for user answer
- **AND** proceed based on user choice

#### Scenario: Autonomy guidelines in prompt
- **WHEN** agent is in Act mode
- **THEN** system prompt SHALL include autonomy guidelines:
  - Small changes: proceed (formatting, obvious fixes)
  - Medium changes: mention but proceed
  - Large changes: ask via question format
- **AND** examples of each category
- **AND** severity levels (critical, major, minor)

### Requirement: Question-Based Approval
The system SHALL support structured questions with predefined options for user decisions.

#### Scenario: Agent asks a question
- **WHEN** agent needs user input during Act mode
- **THEN** agent SHALL output JSON question:
  ```json
  {
    "type": "question",
    "question": "Should I also update the test files?",
    "context": "I noticed tests use old API",
    "severity": "minor",
    "options": [
      {
        "label": "Yes, update tests",
        "value": "update_tests",
        "description": "Update test files to match"
      },
      {
        "label": "No, skip tests",
        "value": "skip_tests",
        "description": "Leave tests as-is"
      }
    ],
    "default": "skip_tests"
  }
  ```
- **AND** system SHALL parse and store as Question message
- **AND** frontend SHALL render as interactive card
- **AND** user SHALL select an option
- **AND** answer SHALL be sent back to agent
- **AND** execution SHALL resume

#### Scenario: Question severity levels
- **WHEN** question has severity level
- **THEN** severity SHALL be: critical, major, or minor
- **AND** frontend SHALL use severity for styling
- **AND** critical questions SHALL be prominent (red/warning)
- **AND** minor questions SHALL be less emphasized

### Requirement: Read-Only Tool Restriction
The system SHALL enforce read-only tool access in Plan mode.

#### Scenario: Plan mode tool filtering
- **WHEN** generating prompt for Plan mode
- **THEN** system SHALL include only tools marked `read_only: true`
- **AND** tools like read_file, search_code, list_directory SHALL be available
- **AND** tools like update_file, create_file, delete_file SHALL NOT be listed
- **AND** agent SHALL NOT be able to call write tools

#### Scenario: Act mode tool access
- **WHEN** generating prompt for Act mode
- **THEN** system SHALL include all tools (read and write)
- **AND** agent SHALL have full tool access
- **AND** approval requirements still apply per tool

#### Scenario: Tool definition includes read_only flag
- **WHEN** defining a tool
- **THEN** tool definition SHALL include `read_only: bool` field
- **AND** default SHALL be `false` (write tool)
- **AND** read-only tools SHALL be explicitly marked `true`

### Requirement: Mode-Specific Prompts
The system SHALL inject different instructions based on current agent mode.

#### Scenario: Plan mode prompt instructions
- **WHEN** generating system prompt for Plan mode
- **THEN** prompt SHALL include:
  - "You are in PLAN mode"
  - Description of mode purpose (analyze, plan, discuss)
  - Read-only tool restrictions
  - Plan JSON format specification
  - Examples of good plans
- **AND** emphasize review and discussion
- **AND** explain user must switch to Act mode for execution

#### Scenario: Act mode prompt instructions
- **WHEN** generating system prompt for Act mode
- **THEN** prompt SHALL include:
  - "You are in ACT mode"
  - Description of mode purpose (execute plan)
  - Autonomy guidelines (when to ask vs proceed)
  - Question JSON format specification
  - Severity level guidelines
- **AND** emphasize executing approved plan
- **AND** explain when to ask for approval



