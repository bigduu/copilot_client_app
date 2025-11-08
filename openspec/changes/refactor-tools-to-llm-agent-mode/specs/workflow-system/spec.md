## ADDED Requirements

### Requirement: Workflow Definition

The system SHALL provide a Workflow abstraction for user-invoked actions with parameter extraction.

#### Scenario: Workflow has metadata

- **WHEN** defining a workflow
- **THEN** it SHALL include: unique name, display name, description, category ID
- **AND** it SHALL declare required parameters with types and descriptions
- **AND** it SHALL specify invocation method (command, UI button, etc.)

#### Scenario: Workflow vs Tool distinction

- **GIVEN** a user-facing action
- **WHEN** determining if it should be a Tool or Workflow
- **THEN** if invoked explicitly by user, it SHALL be a Workflow
- **AND** if invoked autonomously by LLM, it SHALL be a Tool
- **AND** the same underlying logic MAY be exposed as both

### Requirement: Workflow Registration

The system SHALL provide a registry for workflows similar to the tool registry.

#### Scenario: Register workflow at startup

- **GIVEN** the backend application starts
- **WHEN** initializing workflow system
- **THEN** all workflows SHALL be registered in WorkflowRegistry
- **AND** each workflow SHALL have a unique identifier
- **AND** the registry SHALL be accessible to web service layer

#### Scenario: List available workflows

- **WHEN** frontend requests available workflows
- **THEN** backend SHALL return list of all registered workflows
- **AND** include metadata for each workflow (name, description, parameters)
- **AND** filter by category if requested

### Requirement: Workflow Invocation

The system SHALL allow frontend to invoke workflows with extracted parameters.

#### Scenario: User invokes workflow via command

- **GIVEN** user types `/create_project MyProject` in chat input
- **WHEN** frontend parses the command
- **THEN** it SHALL identify workflow name as `create_project`
- **AND** extract user description as `MyProject`
- **AND** send workflow invocation request to backend

#### Scenario: Backend executes workflow

- **GIVEN** a workflow invocation request with parameters
- **WHEN** backend receives the request
- **THEN** it SHALL validate workflow exists
- **AND** validate parameters match workflow definition
- **AND** execute the workflow logic
- **AND** return result to frontend

#### Scenario: Workflow execution result

- **WHEN** workflow completes execution
- **THEN** backend SHALL return structured result: success/failure, output message, any artifacts
- **AND** frontend SHALL display result in chat
- **AND** optionally update UI state (e.g., refresh project list)

### Requirement: Workflow Parameter Extraction

The system SHALL support multiple parameter extraction strategies for workflows.

#### Scenario: Command-based parameter extraction

- **GIVEN** user types `/workflow_name arg1 arg2`
- **WHEN** frontend parses command
- **THEN** it SHALL split command by spaces
- **AND** map positional arguments to workflow parameters
- **AND** validate required parameters are provided

#### Scenario: AI-assisted parameter extraction

- **GIVEN** workflow has complex parameters
- **WHEN** user provides natural language description
- **THEN** frontend MAY use LLM to extract structured parameters
- **AND** present extracted parameters to user for confirmation
- **AND** send confirmed parameters to backend

#### Scenario: Form-based parameter input

- **GIVEN** workflow is invoked via UI button
- **WHEN** user clicks the workflow button
- **THEN** frontend SHALL display a form with parameter fields
- **AND** validate inputs before submission
- **AND** send validated parameters to backend

### Requirement: Workflow Categorization

The system SHALL organize workflows by categories for UI presentation.

#### Scenario: Workflow belongs to category

- **WHEN** defining a workflow
- **THEN** it SHALL be assigned to exactly one category
- **AND** the category SHALL determine UI grouping

#### Scenario: List workflows by category

- **WHEN** frontend requests workflows for a specific category
- **THEN** backend SHALL return only workflows in that category
- **AND** workflows SHALL be ordered by priority within category

#### Scenario: Category metadata for workflows

- **GIVEN** a workflow category
- **WHEN** frontend fetches category info
- **THEN** backend SHALL return: category name, icon, description, list of workflows
- **AND** categories SHALL have display order priority

### Requirement: Workflow Approval and Safety

The system SHALL support approval gates for workflows that perform destructive operations.

#### Scenario: Workflow requires approval

- **GIVEN** a workflow with `requires_approval: true`
- **WHEN** user invokes the workflow
- **THEN** frontend SHALL display approval modal with workflow details
- **AND** wait for user confirmation before sending to backend

#### Scenario: Workflow with preview

- **GIVEN** a workflow that modifies files
- **WHEN** workflow generates execution plan
- **THEN** it SHALL return a preview of changes
- **AND** wait for user approval before applying changes
- **AND** allow user to cancel before execution

### Requirement: Workflow Backend Implementation

The system SHALL provide Rust crate `workflow_system` for workflow definitions and execution.

#### Scenario: Workflow trait

- **WHEN** implementing a new workflow
- **THEN** it SHALL implement the `Workflow` trait
- **AND** provide `definition()` method returning metadata
- **AND** provide `execute()` async method taking parameters and returning result

#### Scenario: Workflow executor

- **GIVEN** a workflow invocation request
- **WHEN** backend processes the request
- **THEN** WorkflowExecutor SHALL look up workflow by name
- **AND** pass parameters to workflow's `execute()` method
- **AND** handle errors and return structured result

### Requirement: Workflow API Endpoints

The system SHALL expose REST API endpoints for workflow operations.

#### Scenario: List available workflows

- **WHEN** GET `/v1/workflows/available` is called
- **THEN** it SHALL return JSON array of workflow metadata
- **AND** include: name, display_name, description, parameters, category_id

#### Scenario: Get workflow categories

- **WHEN** GET `/v1/workflows/categories` is called
- **THEN** it SHALL return JSON array of category metadata
- **AND** include: id, name, icon, workflows list

#### Scenario: Execute workflow

- **WHEN** POST `/v1/workflows/execute` with `{"workflow_name": "...", "parameters": {...}}` is called
- **THEN** it SHALL execute the workflow
- **AND** return result: `{"success": true, "output": "...", "artifacts": [...]}`

#### Scenario: Get single workflow info

- **WHEN** GET `/v1/workflows/{name}` is called
- **THEN** it SHALL return detailed workflow metadata
- **AND** include parameter schemas and examples

## MODIFIED Requirements

N/A - This is a new capability, no existing requirements to modify.

## REMOVED Requirements

N/A - This is a new capability, no existing requirements to remove.


