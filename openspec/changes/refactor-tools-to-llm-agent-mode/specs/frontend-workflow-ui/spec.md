## ADDED Requirements

### Requirement: Workflow Selector Component

The system SHALL provide a UI component for users to discover and invoke workflows.

#### Scenario: Display available workflows

- **WHEN** user opens workflow selector
- **THEN** it SHALL display all available workflows grouped by category
- **AND** show workflow name, icon, and description
- **AND** indicate which workflows require parameters

#### Scenario: Search workflows

- **WHEN** user types in workflow search box
- **THEN** it SHALL filter workflows by name or description
- **AND** highlight matching text
- **AND** show category labels for filtered results

#### Scenario: Invoke workflow from selector

- **WHEN** user clicks a workflow in the selector
- **THEN** it SHALL insert workflow command into chat input (e.g., `/create_project `)
- **OR** if workflow requires complex parameters, open parameter input form
- **AND** focus chat input for user to complete the command

### Requirement: Workflow Command Input

The system SHALL support command-based workflow invocation in the chat input.

#### Scenario: Autocomplete workflow commands

- **WHEN** user types `/` in chat input
- **THEN** it SHALL show autocomplete suggestions for workflows
- **AND** display workflow name and description in suggestions
- **AND** insert full command on selection

#### Scenario: Parse workflow command on submit

- **GIVEN** user types `/workflow_name arguments` and presses Enter
- **WHEN** frontend processes the input
- **THEN** it SHALL detect workflow command pattern
- **AND** extract workflow name and arguments
- **AND** send workflow invocation request to backend (not chat message)

#### Scenario: Workflow command validation

- **WHEN** user submits workflow command
- **THEN** frontend SHALL validate workflow exists
- **AND** validate required parameters are provided
- **AND** show error if validation fails
- **AND** NOT send invalid command to backend

### Requirement: Workflow Parameter Form

The system SHALL provide a form UI for workflows with complex parameters.

#### Scenario: Display parameter form

- **GIVEN** workflow requires multiple structured parameters
- **WHEN** user invokes workflow via selector
- **THEN** frontend SHALL display a modal form
- **AND** include input fields for each parameter with labels and descriptions
- **AND** mark required fields
- **AND** provide field validation

#### Scenario: Submit workflow via form

- **WHEN** user fills form and clicks Submit
- **THEN** frontend SHALL validate all required fields
- **AND** send workflow invocation request with structured parameters
- **AND** close form modal
- **AND** show loading indicator in chat

### Requirement: Workflow Execution Feedback

The system SHALL provide visual feedback during workflow execution.

#### Scenario: Show workflow execution in chat

- **WHEN** user invokes a workflow
- **THEN** frontend SHALL add a message to chat: "Executing workflow: {name}..."
- **AND** show loading spinner
- **AND** display workflow parameters (if any)

#### Scenario: Display workflow result

- **WHEN** workflow execution completes
- **THEN** frontend SHALL update the message with result
- **AND** show success or error indicator
- **AND** display output text or artifacts
- **AND** remove loading spinner

#### Scenario: Workflow progress for long operations

- **GIVEN** workflow takes >3 seconds to execute
- **WHEN** workflow is running
- **THEN** frontend MAY display progress updates if backend provides them
- **AND** show elapsed time
- **AND** allow user to cancel operation

### Requirement: Workflow Service Integration

The system SHALL provide a frontend service for workflow interactions.

#### Scenario: Fetch available workflows

- **WHEN** frontend initializes or user opens workflow selector
- **THEN** WorkflowService SHALL call GET `/v1/workflows/available`
- **AND** cache results for 5 minutes
- **AND** return workflow list to UI components

#### Scenario: Execute workflow

- **GIVEN** user invokes workflow with parameters
- **WHEN** WorkflowService.executeWorkflow() is called
- **THEN** it SHALL send POST to `/v1/workflows/execute` with workflow name and parameters
- **AND** return promise that resolves with result
- **AND** handle errors and timeouts

#### Scenario: Validate workflow parameters

- **WHEN** WorkflowService validates parameters
- **THEN** it SHALL check required parameters are present
- **AND** validate parameter types match definition
- **AND** return validation error messages if invalid

### Requirement: Agent Loop Approval Modal

The system SHALL enhance approval modal to support agent loop context.

#### Scenario: Display tool call during agent loop

- **GIVEN** backend requests approval for tool call during agent loop
- **WHEN** frontend receives approval request
- **THEN** it SHALL display ApprovalModal with tool name and parameters
- **AND** indicate this is part of an agent execution (e.g., "Step 2 of ongoing task")
- **AND** show previous tool calls in the loop (optional collapsible section)

#### Scenario: Approve tool in agent loop

- **WHEN** user approves tool call during agent loop
- **THEN** frontend SHALL send approval to backend
- **AND** keep approval modal open or show "Waiting for next step..." indicator
- **AND** be ready for next approval request

#### Scenario: Reject tool in agent loop

- **WHEN** user rejects tool call during agent loop
- **THEN** frontend SHALL send rejection to backend
- **AND** display message that agent execution was aborted
- **AND** close approval modal

### Requirement: Simplified Chat State Machine

The frontend chat state machine SHALL be simplified by removing tool call parsing logic.

#### Scenario: Send message without tool detection

- **WHEN** user submits a regular chat message (not workflow command)
- **THEN** state machine SHALL send message directly to backend
- **AND** NOT attempt to parse for tool calls
- **AND** wait for backend response (text or approval request)

#### Scenario: Handle backend approval requests

- **WHEN** backend sends tool approval request during agent loop
- **THEN** state machine SHALL transition to "awaiting_approval" state
- **AND** display approval modal
- **AND** pause other interactions until approval resolved

#### Scenario: Stream LLM response

- **WHEN** backend streams LLM response
- **THEN** state machine SHALL accumulate chunks and display in real-time
- **AND** NOT parse chunks for tool calls
- **AND** finalize message when stream completes

## MODIFIED Requirements

N/A - Frontend workflow UI is a new capability. The Tool Selector component is removed (see REMOVED section), not modified.

## REMOVED Requirements

### Requirement: Frontend Tool Call Parsing

**Reason**: Tool calls are now parsed on backend only.

**Migration**: Remove tool call parsing logic from `ChatInteractionMachine`, `ToolService`, and related components.

### Requirement: Tool Definition Display in Frontend

**Reason**: Tools are no longer visible to users; only workflows are displayed.

**Migration**: Remove any UI that displays tool lists, tool parameters, or tool metadata (except in approval modals).

### Requirement: Frontend Tool-to-Prompt Injection

**Reason**: System prompt enhancement happens on backend.

**Migration**: Remove `SystemPromptEnhancer.ts` and related frontend logic for injecting tools into prompts.
