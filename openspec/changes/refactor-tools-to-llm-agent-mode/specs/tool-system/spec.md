## ADDED Requirements

### Requirement: JSON Tool Call Format
The system SHALL require LLM to output tool calls in strict JSON format with tool name, parameters, and termination flag.

#### Scenario: Valid JSON tool call
- **WHEN** LLM wants to invoke a tool
- **THEN** it SHALL output a JSON object with fields: `tool` (string), `parameters` (object), `terminate` (boolean)
- **AND** the JSON SHALL be machine-parsable without ambiguity

#### Scenario: Termination flag controls agent loop
- **GIVEN** a tool call with `"terminate": false`
- **WHEN** the tool execution completes
- **THEN** the system SHALL automatically append the result to chat history
- **AND** send the updated chat back to the LLM for continuation

#### Scenario: Termination flag stops agent loop
- **GIVEN** a tool call with `"terminate": true`
- **WHEN** the tool execution completes
- **THEN** the system SHALL NOT send additional requests to LLM
- **AND** return the final result to the frontend

### Requirement: Tool Definition in System Prompt
The system SHALL inject all available tool definitions into the system prompt for LLM consumption.

#### Scenario: Tool definition includes calling convention
- **WHEN** generating enhanced system prompt
- **THEN** each tool SHALL be described with: name, description, parameters (name, type, required, description)
- **AND** the prompt SHALL include instructions for JSON tool call format
- **AND** the prompt SHALL explain the `terminate` flag behavior

#### Scenario: Tool definitions are backend-managed
- **GIVEN** a system prompt ID
- **WHEN** backend prepares prompt for LLM
- **THEN** tool definitions SHALL be injected on the backend
- **AND** frontend SHALL NOT be involved in tool injection

### Requirement: Agent Loop Execution
The system SHALL support autonomous agent loops where LLM can chain multiple tool calls.

#### Scenario: Multi-step agent execution
- **GIVEN** LLM returns a tool call with `"terminate": false`
- **WHEN** the tool executes successfully
- **THEN** the system SHALL append the result to the conversation
- **AND** send the updated conversation back to LLM
- **AND** repeat until a tool call with `"terminate": true` or text response is received

#### Scenario: Agent loop iteration limit
- **GIVEN** an agent loop is running
- **WHEN** the loop reaches a maximum iteration count (e.g., 10)
- **THEN** the system SHALL force-terminate the loop
- **AND** return an error message to the user
- **AND** log a warning for debugging

#### Scenario: Agent loop timeout
- **GIVEN** an agent loop is running
- **WHEN** total execution time exceeds a timeout threshold (e.g., 5 minutes)
- **THEN** the system SHALL abort the loop
- **AND** return a timeout error to the user

### Requirement: Tool Call Parsing and Validation
The system SHALL parse LLM output to detect and validate JSON tool calls.

#### Scenario: Extract JSON from LLM response
- **GIVEN** LLM response contains a JSON tool call
- **WHEN** backend parses the response
- **THEN** it SHALL extract the JSON object
- **AND** validate required fields: `tool`, `parameters`, `terminate`
- **AND** validate `terminate` is a boolean value

#### Scenario: Handle malformed JSON
- **GIVEN** LLM returns invalid or incomplete JSON
- **WHEN** parsing fails
- **THEN** the system SHALL send an error message back to LLM
- **AND** ask LLM to retry with correct format
- **AND** after 3 failed attempts, abort and return error to user

#### Scenario: Handle text response (no tool call)
- **GIVEN** LLM returns a text response without tool call
- **WHEN** backend parses the response
- **THEN** it SHALL detect no tool call is present
- **AND** return the text response to frontend
- **AND** NOT enter agent loop

### Requirement: Tool Approval During Agent Loop
The system SHALL request user approval for tool calls that require approval, even during agent loops.

#### Scenario: Approval request in agent loop
- **GIVEN** a tool with `requires_approval: true` is called during agent loop
- **WHEN** the tool call is detected
- **THEN** the system SHALL pause the agent loop
- **AND** send approval request to frontend
- **AND** wait for user response before continuing

#### Scenario: Approval rejection aborts loop
- **GIVEN** user is prompted for tool approval during agent loop
- **WHEN** user rejects the approval
- **THEN** the system SHALL abort the agent loop
- **AND** return rejection message to frontend
- **AND** NOT execute subsequent tool calls

## REMOVED Requirements

### Requirement: Tools Exposed to Frontend
**Reason**: Tools are now LLM-driven and hidden from frontend UI.

**Migration**: Frontend no longer calls `/tools/available`. Workflows replace user-visible actions.

### Requirement: User-Invoked Tool Commands
**Reason**: User-invoked commands are now Workflows, not Tools.

**Migration**: Existing user-facing tools (like `/create_project`) should be migrated to Workflow system.

### Requirement: Frontend Tool Call Parsing
**Reason**: Tool calls are parsed on backend only.

**Migration**: Remove `ToolService.parseUserCommand()` and `parseAIResponseToToolCall()` from frontend.


