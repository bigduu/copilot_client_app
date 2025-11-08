# Message Types Specification Delta

## ADDED Requirements

### Requirement: Project Structure Messages

The system SHALL support Project Structure messages to convey workspace organization information to the LLM.

**Rationale**: When the AI needs to understand the entire project layout (not just individual files), a dedicated message type provides structured, parseable project information.

#### Scenario: Provide directory tree structure

- **WHEN** the AI requests project structure information
- **AND** the structure type is "tree"
- **THEN** the system SHALL generate a DirectoryNode hierarchy
- **AND** include file information for each directory
- **AND** respect excluded patterns (e.g., `.git`, `node_modules`)
- **AND** timestamp the structure with `generated_at`

#### Scenario: Provide flat file list

- **WHEN** the AI requests project structure information
- **AND** the structure type is "file_list"
- **THEN** the system SHALL generate a flat list of FileInfo objects
- **AND** include path, size, MIME type, and language for each file
- **AND** sort files by relevance or alphabetically

#### Scenario: Provide dependency graph

- **WHEN** the AI requests project structure information
- **AND** the structure type is "dependencies"
- **THEN** the system SHALL parse project dependency files (package.json, Cargo.toml, etc.)
- **AND** generate a DependencyGraph structure
- **AND** include direct and transitive dependencies

### Requirement: MCP Tool Messages

The system SHALL distinguish between regular tool calls and MCP (Model Context Protocol) tool calls with dedicated message types.

**Rationale**: MCP tools have different execution contexts, approval requirements, and error handling compared to built-in tools. Separate message types enable proper routing and processing.

#### Scenario: MCP tool invocation request

- **WHEN** the LLM requests an MCP tool execution
- **THEN** the system SHALL create an MCPToolRequestMsg
- **AND** include the MCP server name
- **AND** include the tool name within that server
- **AND** track approval status separately from regular tools
- **AND** generate a unique request_id for correlation

#### Scenario: MCP tool execution result

- **WHEN** an MCP tool completes execution
- **THEN** the system SHALL create an MCPToolResultMsg
- **AND** correlate with the original request_id
- **AND** include execution status, duration, and result
- **AND** capture MCP-specific error details if execution fails

#### Scenario: MCP vs regular tool differentiation

- **WHEN** displaying tool execution history
- **THEN** the UI SHALL clearly distinguish MCP tools from built-in tools
- **AND** show the MCP server name for MCP tools
- **AND** apply different icons or styling

### Requirement: Workflow Execution Messages

The system SHALL support Workflow Execution messages to track multi-step workflow progress.

**Rationale**: Workflows consist of multiple coordinated steps. A dedicated message type allows the AI and frontend to monitor workflow progress, pause/resume execution, and handle failures gracefully.

#### Scenario: Workflow execution initiation

- **WHEN** a workflow begins execution
- **THEN** the system SHALL create a WorkflowExecMsg
- **AND** set status to "Running"
- **AND** initialize completed_steps to 0
- **AND** record the workflow name and execution_id
- **AND** set started_at timestamp

#### Scenario: Workflow step progression

- **WHEN** a workflow step completes successfully
- **THEN** the system SHALL update the WorkflowExecMsg
- **AND** increment completed_steps
- **AND** update current_step to the next step name
- **AND** update updated_at timestamp
- **AND** emit a ContextUpdate event

#### Scenario: Workflow completion

- **WHEN** all workflow steps complete successfully
- **THEN** the system SHALL set status to "Completed"
- **AND** set current_step to None
- **AND** populate result with the final output
- **AND** emit a final ContextUpdate event

#### Scenario: Workflow failure handling

- **WHEN** a workflow step fails
- **THEN** the system SHALL set status to "Failed"
- **AND** populate error with detailed ErrorDetail
- **AND** preserve completed_steps for partial progress tracking
- **AND** emit a failure ContextUpdate event

#### Scenario: Workflow pause and resume

- **WHEN** a user pauses a running workflow
- **THEN** the system SHALL set status to "Paused"
- **AND** preserve current_step and completed_steps
- **WHEN** the user resumes the workflow
- **THEN** the system SHALL set status to "Running"
- **AND** continue from the current_step

## MODIFIED Requirements

### Requirement: Message Type Enumeration

The system SHALL use a rich enumeration of message types to provide type-safe, detailed message handling.

**Modifications**:
- ADDED: `ProjectStructure(ProjectStructMsg)` - Project structure information
- ADDED: `MCPToolRequest(MCPToolRequestMsg)` - MCP tool invocation requests
- ADDED: `MCPToolResult(MCPToolResultMsg)` - MCP tool execution results
- ADDED: `WorkflowExecution(WorkflowExecMsg)` - Workflow execution status

**Previous**: Only had Text, Image, FileReference, ToolRequest, ToolResult, MCPResource, SystemControl, and Processing types.

#### Scenario: Message type selection

- **WHEN** the system needs to represent project structure
- **THEN** it SHALL use ProjectStructure variant
- **WHEN** the system needs to track MCP tool calls
- **THEN** it SHALL use MCPToolRequest and MCPToolResult variants (not regular ToolRequest/ToolResult)
- **WHEN** the system needs to track workflow execution
- **THEN** it SHALL use WorkflowExecution variant

#### Scenario: Message type serialization

- **WHEN** any message type is serialized to JSON
- **THEN** it SHALL include a "kind" field indicating the type
- **AND** a "data" field containing the type-specific structure
- **AND** be deserializable back to the exact same type

### Requirement: Tool Call Differentiation

The system SHALL differentiate between built-in tools, custom tools, and MCP tools at the message type level.

**Modifications**:
- Built-in and custom tools use `ToolRequest` and `ToolResult`
- MCP tools use `MCPToolRequest` and `MCPToolResult`

**Previous**: All tool calls used the same message type, relying on metadata to distinguish MCP tools.

#### Scenario: Tool routing based on message type

- **WHEN** a ToolRequest message is received
- **THEN** the system SHALL route to the built-in/custom tool executor
- **WHEN** an MCPToolRequest message is received
- **THEN** the system SHALL route to the MCP tool executor
- **AND** include the server_name in the routing decision

## Implementation Notes

### Data Structures

```rust
pub enum RichMessageType {
    Text(TextMessage),
    Image(ImageMessage),
    FileReference(FileRefMessage),
    ProjectStructure(ProjectStructMsg),       // NEW
    ToolRequest(ToolRequestMessage),
    ToolResult(ToolResultMessage),
    MCPToolRequest(MCPToolRequestMsg),        // NEW
    MCPToolResult(MCPToolResultMsg),          // NEW
    MCPResource(MCPResourceMessage),
    WorkflowExecution(WorkflowExecMsg),       // NEW
    SystemControl(SystemMessage),
    Processing(ProcessingMessage),
}

pub struct ProjectStructMsg {
    pub root_path: PathBuf,
    pub structure_type: StructureType,        // Tree | FileList | Dependencies
    pub content: ProjectStructureContent,
    pub generated_at: DateTime<Utc>,
    pub excluded_patterns: Vec<String>,
}

pub struct MCPToolRequestMsg {
    pub server_name: String,
    pub tool_name: String,
    pub arguments: HashMap<String, serde_json::Value>,
    pub request_id: String,
    pub approval_status: ApprovalStatus,
    pub requested_at: DateTime<Utc>,
}

pub struct MCPToolResultMsg {
    pub server_name: String,
    pub tool_name: String,
    pub request_id: String,
    pub result: serde_json::Value,
    pub status: ExecutionStatus,
    pub executed_at: DateTime<Utc>,
    pub duration_ms: u64,
    pub error: Option<ErrorDetail>,
}

pub struct WorkflowExecMsg {
    pub workflow_name: String,
    pub execution_id: String,
    pub status: WorkflowStatus,              // Pending | Running | Paused | Completed | Failed | Cancelled
    pub current_step: Option<String>,
    pub total_steps: usize,
    pub completed_steps: usize,
    pub started_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub result: Option<serde_json::Value>,
    pub error: Option<ErrorDetail>,
}
```

### Migration Strategy

1. **Phase 1**: Add new message types to `RichMessageType` enum
2. **Phase 2**: Implement serialization/deserialization tests
3. **Phase 3**: Update message processors to handle new types
4. **Phase 4**: Implement LLM adapter conversions (how these types are sent to LLMs)
5. **Phase 5**: Update frontend to render new message types

### Backward Compatibility

- Existing message types remain unchanged
- New types are additive, not breaking
- Old messages can be parsed without knowledge of new types (forward compatibility)

### Testing Requirements

Each new message type SHALL have:
1. Unit tests for creation and field validation
2. Serialization round-trip tests
3. Integration tests showing usage in full conversation flows
4. LLM adapter conversion tests
