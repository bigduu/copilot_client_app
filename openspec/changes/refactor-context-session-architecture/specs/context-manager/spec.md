## ADDED Requirements

### Requirement: Logic Migration and Centralization

The Context Manager SHALL incorporate all core conversation lifecycle logic, including state machine management and streaming response handling, which were previously distributed across service layers.

#### Scenario: State machine managed by Context Manager

- **GIVEN** a context needs to transition between states
- **WHEN** an operation is performed (e.g., sending a message)
- **THEN** the context SHALL manage its own state transitions
- **AND** the state SHALL be updated internally
- **AND** external services SHALL only invoke high-level methods
- **AND** state consistency SHALL be guaranteed

#### Scenario: Streaming response processing in Context Manager

- **GIVEN** an LLM returns a streaming SSE response
- **WHEN** the context processes the stream
- **THEN** SSE parsing SHALL occur within the context manager
- **AND** chunks SHALL be accumulated internally
- **AND** the context state SHALL update with each chunk
- **AND** ContextUpdate events SHALL be emitted for each chunk
- **AND** web_service SHALL only forward the stream

#### Scenario: Simplified web_service layer

- **GIVEN** a chat message API request
- **WHEN** web_service handles the request
- **THEN** it SHALL only perform request validation
- **AND** it SHALL load the context from session manager
- **AND** it SHALL call a single context method (e.g., send_message)
- **AND** it SHALL format the response stream
- **AND** it SHALL NOT contain business logic

### Requirement: Message Type System

The Context Manager SHALL support a strongly-typed message type system that explicitly represents different kinds of messages.

#### Scenario: Creating a text message

- **GIVEN** a user wants to send a plain text message
- **WHEN** the message is created with role "user" and text content
- **THEN** a MessageType::Text shall be created
- **AND** the message shall contain the text content
- **AND** the message shall be serializable to JSON

#### Scenario: Creating a file reference message

- **GIVEN** a user selects a file to reference in the conversation
- **WHEN** a file reference message is created with file path and optional line range
- **THEN** a MessageType::FileReference shall be created
- **AND** the file path SHALL be stored
- **AND** the line range (if provided) SHALL be stored
- **AND** the message SHALL be marked for content resolution

#### Scenario: Creating a tool request message

- **GIVEN** an LLM wants to call one or more tools
- **WHEN** the assistant response contains tool_calls
- **THEN** a MessageType::ToolRequest shall be created
- **AND** each tool call SHALL have a unique ID
- **AND** each tool call SHALL specify tool name and arguments
- **AND** the approval status SHALL default to Pending

#### Scenario: Creating a tool result message

- **GIVEN** a tool has been executed
- **WHEN** the tool execution completes successfully or with error
- **THEN** a MessageType::ToolResult shall be created
- **AND** the result SHALL reference the original tool request ID
- **AND** the result content SHALL be stored
- **AND** the execution status SHALL be indicated

#### Scenario: Backward compatibility conversion

- **GIVEN** an old format message with optional tool_calls field
- **WHEN** the message is loaded from storage
- **THEN** it SHALL be converted to the appropriate MessageType
- **AND** no data SHALL be lost in the conversion
- **AND** the converted message SHALL be equivalent to the original

### Requirement: Message Processing Pipeline

The Context Manager SHALL provide a composable message processing pipeline that handles different message types uniformly.

#### Scenario: Processing a file reference message

- **GIVEN** a MessageType::FileReference is added to the context
- **WHEN** the pipeline processes the message
- **THEN** the FileReferenceProcessor SHALL resolve the file path
- **AND** the file content SHALL be read (respecting permissions)
- **AND** if line range is specified, only those lines SHALL be extracted
- **AND** the file content SHALL be embedded in the message
- **AND** the message SHALL be marked as resolved

#### Scenario: Enhancing message with tool definitions

- **GIVEN** a text message is ready to be sent to LLM
- **WHEN** the ToolEnhancementProcessor processes it
- **THEN** available tool definitions SHALL be retrieved
- **AND** tool definitions SHALL be filtered based on agent role
- **AND** the system prompt SHALL be enhanced with tool descriptions
- **AND** the LLM SHALL receive the tool-enhanced context

#### Scenario: Pipeline error handling

- **GIVEN** a processor in the pipeline fails
- **WHEN** the error is not recoverable
- **THEN** the pipeline SHALL stop processing
- **AND** an error result SHALL be returned
- **AND** the context state SHALL be rolled back to before processing
- **AND** the error SHALL be logged with trace information

#### Scenario: Conditional processor execution

- **GIVEN** a pipeline with multiple processors
- **WHEN** a processor returns ProcessResult::Complete
- **THEN** remaining processors SHALL be skipped
- **AND** the message SHALL be marked as ready for LLM
- **AND** the processing time SHALL be recorded

### Requirement: Tool Auto-Loop Execution

The Context Manager SHALL support automatic, iterative tool execution based on configurable approval policies.

#### Scenario: Auto-approve whitelisted tools

- **GIVEN** the context has ToolApprovalPolicy::WhiteList(["read_file", "search_code"])
- **WHEN** the LLM requests to call "read_file"
- **THEN** the tool SHALL be executed automatically without user approval
- **AND** the tool result SHALL be added to the context
- **AND** the updated context SHALL be sent back to the LLM
- **AND** this loop SHALL continue until no more tool calls are made

#### Scenario: Manual approval for unlisted tools

- **GIVEN** the context has ToolApprovalPolicy::WhiteList(["read_file"])
- **WHEN** the LLM requests to call "delete_file"
- **THEN** the tool execution SHALL pause
- **AND** the user SHALL be prompted for approval
- **AND** if approved, the tool SHALL execute
- **AND** if denied, an error message SHALL be sent to the LLM

#### Scenario: Auto-loop depth limit

- **GIVEN** the context has ToolApprovalPolicy::LimitedAuto { max_depth: 3 }
- **WHEN** tool calls exceed the depth limit
- **THEN** the auto-loop SHALL stop
- **AND** the user SHALL be notified
- **AND** the last response SHALL be presented to the user
- **AND** the user MAY manually continue if desired

#### Scenario: Auto-loop timeout protection

- **GIVEN** an auto-loop is executing
- **WHEN** a single loop iteration exceeds 30 seconds
- **THEN** the execution SHALL be terminated
- **AND** a timeout error SHALL be logged
- **AND** the user SHALL be notified
- **AND** the context state SHALL remain consistent

#### Scenario: User interruption of auto-loop

- **GIVEN** an auto-loop is in progress
- **WHEN** the user sends an interrupt signal
- **THEN** the current tool execution SHALL complete
- **AND** no further automatic tool calls SHALL be made
- **AND** the partial results SHALL be preserved
- **AND** the user MAY resume manually

### Requirement: Streaming Context Updates

The Context Manager SHALL emit structured ContextUpdate events during streaming operations, providing complete context state information to enable intelligent frontend rendering.

#### Scenario: ContextUpdate structure

- **GIVEN** a streaming operation is in progress
- **WHEN** a ContextUpdate is emitted
- **THEN** the update SHALL include the context ID
- **AND** the current state SHALL be included
- **AND** the previous state SHALL be included (if changed)
- **AND** message updates SHALL be included (if any)
- **AND** timestamp and metadata SHALL be included

#### Scenario: Streaming text delta updates

- **GIVEN** the LLM is streaming a text response
- **WHEN** each chunk arrives
- **THEN** the backend SHALL emit a `content_delta` SSE event whose payload includes at least `context_id`, `message_id`, `sequence`, and a boolean `is_final` flag (set to `false` for intermediate chunks)
- **AND** the accompanying `context_update` SHALL carry only state changes and lightweight metadata (no large text blobs)

#### Scenario: State transition updates

- **GIVEN** the context state changes
- **WHEN** the transition occurs
- **THEN** a ContextUpdate SHALL be emitted immediately
- **AND** the previous_state SHALL be set
- **AND** the current_state SHALL be updated
- **AND** the frontend SHALL be able to render appropriate UI based on the state

#### Scenario: Message lifecycle updates

- **GIVEN** a new message is being processed
- **WHEN** the message goes through its lifecycle
- **THEN** a Created update SHALL be emitted when the message is created
- **AND** streaming progress SHALL be communicated via `content_delta` events (metadata-only)
- **AND** StatusChanged updates SHALL be emitted on status changes
- **AND** a Completed update SHALL be emitted when finalized

#### Scenario: Streaming completion events

- **GIVEN** 流式响应结束
- **WHEN** LLM 发送终止信号或后端完成聚合
- **THEN** 后端 SHALL 发送 `content_final`（或 `content_end`）事件，payload 至少包含 `context_id`、`message_id`、最终 `sequence`、`is_final: true`
- **AND** 对应的 `context_update` SHALL 将状态切回 Idle（或下一状态）并不再附带文本

#### Scenario: Frontend state-driven rendering

- **GIVEN** the frontend receives ContextUpdate events
- **WHEN** processing each update
- **THEN** the frontend SHALL update its UI based on current_state
- **AND** processing indicators SHALL be shown for ProcessingMessage state
- **AND** streaming animations SHALL be shown for StreamingLLMResponse state
- **AND** approval dialogs SHALL be shown for AwaitingToolApproval state
- **AND** progress indicators SHALL be shown for ToolAutoLoop state

### Requirement: Context Optimization for LLM

The Context Manager SHALL intelligently optimize context sent to LLMs to maximize useful information while respecting token limits.

#### Scenario: Token limit detection

- **GIVEN** a context is being prepared for LLM
- **WHEN** the total token count is calculated
- **THEN** messages SHALL be tokenized accurately
- **AND** the count SHALL include system prompt, messages, and tool definitions
- **AND** if the count exceeds the limit, optimization SHALL be triggered

#### Scenario: Intelligent message prioritization

- **GIVEN** optimization is needed
- **WHEN** selecting messages to keep
- **THEN** the system prompt SHALL always be kept
- **AND** the most recent N messages SHALL be kept (for continuity)
- **AND** all tool call and result messages SHALL be kept (for context)
- **AND** file reference messages SHALL be kept if recently accessed
- **AND** older text messages MAY be summarized or dropped

#### Scenario: Message summarization

- **GIVEN** old messages need to be compressed
- **WHEN** summarization is triggered
- **THEN** a batch of old messages SHALL be sent to the LLM for summarization
- **AND** the summary SHALL be stored as a new SystemControl message
- **AND** the summary SHALL replace the original messages in the optimized context
- **AND** the original messages SHALL remain in storage

#### Scenario: Optimization transparency

- **GIVEN** context has been optimized
- **WHEN** the user views the conversation
- **THEN** an indicator SHALL show that history was optimized
- **AND** the user SHALL be able to view the full unoptimized history
- **AND** the optimization SHALL not affect the stored messages

#### Scenario: Configurable optimization strategies

- **GIVEN** different use cases need different strategies
- **WHEN** configuring optimization
- **THEN** strategies SHALL be selectable (RecentN, Intelligent, ImportanceScoring)
- **AND** each strategy SHALL have configurable parameters
- **AND** the strategy SHALL be stored in ChatConfig
- **AND** optimization SHALL respect the configured strategy

### Requirement: Dynamic System Prompt Management

The Context Manager SHALL support dynamic system prompt generation based on context state and mode.

#### Scenario: Mode-specific prompt injection

- **GIVEN** the context is in "Plan" mode
- **WHEN** generating the system prompt
- **THEN** planning-specific instructions SHALL be included
- **AND** read-only tool descriptions SHALL be included
- **AND** execution instructions SHALL be excluded

#### Scenario: Tool availability in prompt

- **GIVEN** the agent role is "Planner"
- **WHEN** generating the system prompt
- **THEN** only read-permission tools SHALL be listed
- **AND** tool descriptions SHALL be formatted consistently
- **AND** tool usage examples SHALL be included (if available)

#### Scenario: Workspace context injection

- **GIVEN** a workspace path is set in the context config
- **WHEN** generating the system prompt
- **THEN** the workspace path SHALL be mentioned
- **AND** file paths SHALL be resolved relative to the workspace
- **AND** workspace-specific instructions SHALL be included

#### Scenario: Branch-specific prompt override

- **GIVEN** a branch has a custom system prompt
- **WHEN** generating messages for that branch
- **THEN** the branch-specific prompt SHALL take precedence
- **AND** the base system prompt SHALL be used as fallback
- **AND** prompt changes SHALL not affect other branches

### Requirement: Fine-Grained State Machine

The Context Manager SHALL implement a fine-grained state machine where every operation has an explicit state, eliminating the need for auxiliary boolean flags or status fields.

#### Scenario: Detailed state enumeration

- **GIVEN** the system needs to track operation progress
- **WHEN** defining states
- **THEN** each distinct operation SHALL have its own state variant
- **AND** states SHALL be self-explanatory by name
- **AND** no boolean flags SHALL be used to differentiate substates
- **AND** states MAY carry contextual data (progress, counts, names)

#### Scenario: Message processing state granularity

- **GIVEN** a user message is being processed
- **WHEN** the processing progresses
- **THEN** the state SHALL transition through specific states:
  - ProcessingUserMessage (validating and parsing)
  - ResolvingFileReferences (if file refs exist)
  - EnhancingSystemPrompt (injecting tools and context)
  - OptimizingContext (checking token limits)
  - PreparingLLMRequest (building final request)
- **AND** each state SHALL be emitted as a ContextUpdate
- **AND** the frontend SHALL be able to show specific progress for each state

#### Scenario: Streaming state granularity

- **GIVEN** an LLM is streaming a response
- **WHEN** receiving chunks
- **THEN** distinct states SHALL be used:
  - ConnectingToLLM (establishing connection)
  - AwaitingLLMFirstChunk (waiting for initial response)
  - StreamingLLMResponse { chunks, chars } (actively receiving)
  - ProcessingLLMResponse (stream completed, processing)
- **AND** StreamingLLMResponse SHALL carry chunk count and char count
- **AND** the frontend SHALL display accurate streaming progress

#### Scenario: Tool execution state granularity

- **GIVEN** tools need to be executed
- **WHEN** processing tool calls
- **THEN** distinct states SHALL be used:
  - ParsingToolCalls (parsing the tool requests)
  - AwaitingToolApproval { pending_requests, tool_names } (waiting for user)
  - ExecutingTool { tool_name, attempt } (executing)
  - CollectingToolResults (gathering results)
  - ProcessingToolResults (formatting results)
- **AND** ExecutingTool SHALL carry current progress and attempt number
- **AND** the frontend SHALL show "Executing tool 2/5: read_file"

#### Scenario: Auto-loop state tracking

- **GIVEN** tool auto-loop is active
- **WHEN** iterating through loop cycles
- **THEN** the state SHALL be ToolAutoLoop { depth, tools_executed }
- **AND** depth SHALL indicate current loop iteration
- **AND** tools_executed SHALL count total tools called so far
- **AND** the frontend SHALL show "Auto-processing (round 2, 5 tools executed)"

#### Scenario: State without auxiliary flags

- **GIVEN** the context is in any state
- **WHEN** checking what operation is happening
- **THEN** the state enum variant SHALL be sufficient
- **AND** no is_streaming, is_waiting, is_executing flags SHALL exist
- **AND** pattern matching on state SHALL reveal all needed information
- **AND** state transitions SHALL be explicit, not implicit

#### Scenario: State self-documentation

- **GIVEN** a developer or tester reads the state
- **WHEN** examining context.current_state
- **THEN** the state name SHALL immediately convey what is happening
- **AND** state data SHALL provide quantitative progress information
- **AND** no additional fields need to be checked
- **AND** logs showing state transitions SHALL be self-explanatory

### Requirement: Structured Message Payload

The Context Manager SHALL accept structured message payloads from clients, eliminating free-form string parsing.

#### Scenario: Message payload contract

- **GIVEN** the frontend sends a message to the backend
- **WHEN** the request is processed
- **THEN** the payload SHALL conform to the `SendMessageRequest` schema with `session_id`, `payload`, and optional `client_metadata`
- **AND** `payload` SHALL be one of the supported variants (`text`, `file_reference`, `workflow`, `tool_result`, ...)
- **AND** each variant SHALL provide its required fields (e.g., `path` for file references)
- **AND** invalid payloads SHALL result in a validation error with a clear message

#### Scenario: File reference payload

- **GIVEN** the user selects a file with an optional line range
- **WHEN** the frontend sends the message
- **THEN** the payload SHALL use `type: "file_reference"` with `path` and optional `range { start_line, end_line }`
- **AND** `display_text` MAY be provided for UI presentation
- **AND** the Context Manager SHALL receive the structured data without additional parsing steps
- **AND** the Context Manager SHALL process the file reference using the pipeline

#### Scenario: Workflow payload

- **GIVEN** the user triggers a workflow
- **WHEN** the request is sent
- **THEN** the payload SHALL specify `type: "workflow"`, `workflow`, optional `parameters`, and optional `display_text`
- **AND** the Context Manager SHALL execute the workflow with the provided parameters
- **AND** the workflow result SHALL be emitted as a structured tool result message

#### Scenario: Extensible payloads

- **GIVEN** new message types (e.g., images, audio, MCP resources) are introduced
- **WHEN** the frontend sends a payload with a new variant
- **THEN** the backend SHALL expand the enum without breaking existing behavior
- **AND** unsupported variants SHALL be rejected with a descriptive error
- **AND** documentation SHALL enumerate all supported payload types and required fields

### Requirement: Context State Management Enhancement

The Context Manager SHALL maintain clear state throughout the message lifecycle and support complex state transitions.

#### Scenario: Processing message state

- **GIVEN** a new message is added to the context
- **WHEN** the message enters the processing pipeline
- **THEN** the context state SHALL transition to ProcessingMessage
- **AND** concurrent message additions SHALL be queued
- **AND** the state SHALL be persisted
- **AND** on completion, the state SHALL transition to appropriate next state

#### Scenario: Tool auto-loop state

- **GIVEN** the context enters tool auto-loop execution
- **WHEN** automatic tool calls are being made
- **THEN** the context state SHALL be ToolAutoLoop
- **AND** the current loop depth SHALL be tracked
- **AND** the state SHALL include executing tool names
- **AND** state updates SHALL be broadcast to observers

#### Scenario: State recovery after crash

- **GIVEN** the system crashes during message processing
- **WHEN** the context is reloaded
- **THEN** the state SHALL be restored from persistence
- **AND** incomplete operations SHALL be identified
- **AND** the context SHALL transition to a safe state (Idle or Failed)
- **AND** error recovery information SHALL be logged

## MODIFIED Requirements

### Requirement: Message Addition and Retrieval

The Context Manager SHALL provide efficient methods to add and retrieve messages from branches, with enhanced type safety and processing support.

*[Previous content about add_message_to_branch]*

#### Scenario: Adding message triggers pipeline

- **GIVEN** a new message is added to a branch
- **WHEN** add_message_to_branch is called
- **THEN** the message SHALL be processed through the configured pipeline
- **AND** the message SHALL be added to message_pool only after successful processing
- **AND** the message ID SHALL be appended to the branch's message_ids
- **AND** the context SHALL be marked dirty

#### Scenario: Retrieving messages by type

- **GIVEN** a branch contains messages of different types
- **WHEN** retrieving messages for a specific type (e.g., only ToolRequest messages)
- **THEN** only messages matching the type SHALL be returned
- **AND** the order SHALL be preserved
- **AND** the retrieval SHALL not clone the entire message pool

### Requirement: Branch Management

The Context Manager SHALL provide branch management capabilities with support for independent message processing configuration and state tracking.

#### Scenario: Branch-specific pipeline configuration

- **GIVEN** a new branch is created for experimentation
- **WHEN** configuring the branch
- **THEN** the branch MAY have its own MessagePipeline configuration
- **AND** pipeline differences SHALL not affect other branches
- **AND** the default pipeline SHALL be used if not specified

### Requirement: Unified Tool System with MCP Support

The Context Manager SHALL integrate with a unified tool system that supports internal tools, custom tools, and MCP (Model Context Protocol) servers.

#### Scenario: Tool registry initialization

- **GIVEN** the Context Manager starts
- **WHEN** initializing the tool system
- **THEN** a ToolRegistry SHALL be created
- **AND** built-in tools SHALL be automatically registered (file system, codebase, system commands)
- **AND** the registry SHALL be ready to accept MCP server registrations
- **AND** tool metadata SHALL be indexed for quick lookup

#### Scenario: MCP server registration

- **GIVEN** MCP servers are configured in mcp_servers.json
- **WHEN** the system initializes
- **THEN** each MCP server SHALL be connected
- **AND** the server's capabilities SHALL be queried
- **AND** available tools from the server SHALL be automatically discovered
- **AND** tools SHALL be registered with the ToolRegistry
- **AND** if connection fails, an error SHALL be logged and the server skipped

#### Scenario: Dynamic tool discovery from MCP

- **GIVEN** an MCP server is connected
- **WHEN** listing available tools
- **THEN** the MCP server SHALL be queried for its tools
- **AND** each tool SHALL include name, description, and parameters schema
- **AND** tools SHALL be wrapped in a unified Tool interface
- **AND** MCP tools SHALL be indistinguishable from built-in tools to the LLM

#### Scenario: Tool definitions injection

- **GIVEN** a context is preparing to call an LLM
- **WHEN** generating the LLM request
- **THEN** available tools SHALL be filtered based on AgentRole
- **AND** tool definitions SHALL be formatted according to LLM API spec (OpenAI format, Claude format, etc.)
- **AND** definitions SHALL be included in the request
- **AND** the LLM SHALL receive a complete list of callable tools

#### Scenario: Tool execution routing

- **GIVEN** an LLM requests to call a tool
- **WHEN** executing the tool
- **THEN** the ToolRegistry SHALL route to the appropriate handler
- **AND** if it's a built-in tool, it SHALL execute directly
- **AND** if it's an MCP tool, the request SHALL be forwarded to the MCP server
- **AND** the result SHALL be returned in a unified format
- **AND** errors SHALL be handled consistently

#### Scenario: MCP resource as message

- **GIVEN** an MCP server provides resources
- **WHEN** a resource needs to be injected into context
- **THEN** a MessageType::MCPResource message SHALL be created
- **AND** the message SHALL include server_name, resource_uri, content, and mime_type
- **AND** the message SHALL be added to the context
- **AND** the LLM SHALL be able to reference the resource content
- **AND** the resource SHALL be tracked with retrieval timestamp

#### Scenario: Role-based tool filtering

- **GIVEN** a context with AgentRole set to Planner
- **WHEN** getting available tools for the context
- **THEN** only read-only tools SHALL be included
- **AND** tools in categories FileSystem (write), SystemControl SHALL be excluded
- **AND** codebase analysis tools SHALL be included
- **AND** the filtered list SHALL be provided to the LLM

### Requirement: Codebase Tool Integration

The Context Manager SHALL provide codebase analysis tools as part of the internal tool system.

#### Scenario: Codebase search

- **GIVEN** an LLM needs to find code matching a pattern
- **WHEN** the codebase_search tool is invoked
- **THEN** the workspace SHALL be searched using the provided query
- **AND** results SHALL include file paths, line numbers, and code snippets
- **AND** results SHALL be ranked by relevance
- **AND** the maximum number of results SHALL be configurable

#### Scenario: Symbol definition lookup

- **GIVEN** an LLM needs to understand how a function/class is defined
- **WHEN** the find_definition tool is invoked with a symbol name
- **THEN** the codebase index SHALL be queried
- **AND** the definition location SHALL be returned (file and line number)
- **AND** the definition signature SHALL be included
- **AND** if not found, alternatives SHALL be suggested

#### Scenario: Symbol references lookup

- **GIVEN** an LLM needs to see where a symbol is used
- **WHEN** the find_references tool is invoked
- **THEN** all usage locations SHALL be returned
- **AND** each location SHALL include context (surrounding lines)
- **AND** results SHALL be grouped by file
- **AND** the total count SHALL be provided

#### Scenario: Project overview request

- **GIVEN** an LLM needs to understand the project structure
- **WHEN** the get_project_overview tool is invoked
- **THEN** a summary SHALL be generated including:
  - Directory structure
  - Main entry points
  - Key dependencies
  - Project language(s)
  - Estimated size
- **AND** the summary SHALL be optimized for LLM consumption

#### Scenario: Codebase index freshness

- **GIVEN** files in the workspace are modified
- **WHEN** codebase tools are used
- **THEN** the index SHALL be automatically updated
- **AND** stale results SHALL be avoided
- **AND** indexing SHALL happen in the background
- **AND** tool calls SHALL wait for index update if needed

### Requirement: Branch Merging

The Context Manager SHALL support merging messages from one branch into another using configurable strategies.

#### Scenario: Simple append merge

- **GIVEN** two branches exist with different message histories
- **WHEN** merging using Append strategy
- **THEN** all messages from the source branch SHALL be appended to the target
- **AND** duplicate messages SHALL be skipped
- **AND** message order SHALL be preserved
- **AND** the context SHALL be marked dirty

#### Scenario: Cherry-pick merge

- **GIVEN** a user wants to selectively merge specific messages
- **WHEN** merging using CherryPick strategy with selected message IDs
- **THEN** only the specified messages SHALL be copied to target branch
- **AND** message dependencies SHALL be checked
- **AND** warnings SHALL be issued if dependencies are missing
- **AND** the user SHALL be able to proceed or cancel

#### Scenario: Rebase merge

- **GIVEN** branches that diverged from a common ancestor
- **WHEN** merging using Rebase strategy
- **THEN** the common ancestor SHALL be identified
- **AND** new messages from source after the ancestor SHALL be applied to target
- **AND** the target's unique messages SHALL be preserved
- **AND** conflicts SHALL be detected and reported

#### Scenario: Merge conflict detection

- **GIVEN** a merge operation encounters conflicting changes
- **WHEN** conflicts are detected
- **THEN** conflict details SHALL be provided (messages involved, timestamps)
- **AND** merge strategies for resolution SHALL be suggested
- **AND** the user SHALL be able to manually resolve conflicts
- **AND** the merge SHALL not complete until conflicts are resolved

#### Scenario: Post-merge validation

- **GIVEN** a branch merge has completed
- **WHEN** validation is performed
- **THEN** the target branch's message_ids SHALL be valid
- **AND** all referenced messages SHALL exist in message_pool
- **AND** message ordering SHALL be logical
- **AND** branch integrity SHALL be maintained

### Requirement: Testing Support

The Context Manager SHALL provide mechanisms to facilitate testing without requiring real LLM connections.

#### Scenario: Mock LLM client injection

- **GIVEN** tests need to simulate LLM behavior
- **WHEN** a mock LLM client is provided
- **THEN** the context SHALL use the mock client instead of real LLM
- **AND** mock responses SHALL be configurable (content, tool_calls, streaming)
- **AND** response delays SHALL be simulatable
- **AND** error conditions SHALL be testable

#### Scenario: State transition testing

- **GIVEN** a test verifies state machine behavior
- **WHEN** a sequence of operations is performed
- **THEN** each state transition SHALL be observable
- **AND** the transition history SHALL be accessible
- **AND** invalid transitions SHALL be detectable
- **AND** state invariants SHALL be checkable

#### Scenario: Streaming behavior testing

- **GIVEN** tests need to verify streaming logic
- **WHEN** using a mock that simulates streaming
- **THEN** each emitted ContextUpdate SHALL be capturable
- **AND** the update sequence SHALL be verifiable
- **AND** chunk accumulation SHALL be testable
- **AND** stream interruption SHALL be simulatable

#### Scenario: Tool execution testing

- **GIVEN** tests verify tool call handling
- **WHEN** using mock tool executors
- **THEN** tool invocations SHALL be interceptable
- **AND** tool results SHALL be injectable
- **AND** approval flows SHALL be testable
- **AND** auto-loop behavior SHALL be verifiable

### Requirement: Comprehensive Test Coverage

The Context Manager SHALL have comprehensive test coverage for all state transitions, message types, and edge cases.

#### Scenario: State transition sequence testing

- **GIVEN** a test validates a complete conversation flow
- **WHEN** executing the flow with mock LLM
- **THEN** every state transition SHALL be captured
- **AND** the exact state sequence SHALL be verified
- **AND** unexpected states SHALL cause test failure
- **AND** state data (chunks, progress, etc.) SHALL be verifiable

#### Scenario: Error condition testing

- **GIVEN** tests need to verify error handling
- **WHEN** injecting errors at different stages
- **THEN** each error type SHALL be testable:
  - LLM connection failure
  - LLM stream interruption
  - Tool execution failure
  - File read failure
  - Storage failure
- **AND** error recovery paths SHALL be verified
- **AND** TransientError retry logic SHALL be tested
- **AND** Failed state handling SHALL be verified

#### Scenario: Edge case testing

- **GIVEN** the system needs to handle edge cases
- **WHEN** running edge case tests
- **THEN** the following SHALL be covered:
  - Empty messages
  - Very long messages (>10K chars)
  - Messages with many file references (>20)
  - Rapid state transitions
  - Concurrent operations
  - Invalid state transitions
  - Corrupted data
- **AND** each edge case SHALL have dedicated test cases

#### Scenario: Auto-loop boundary testing

- **GIVEN** tool auto-loop is being tested
- **WHEN** testing boundary conditions
- **THEN** the following SHALL be tested:
  - Maximum depth limit reached
  - Timeout during loop
  - Tool failure in middle of loop
  - User interruption
  - Circular tool dependencies
- **AND** state transitions SHALL be correct in all cases

#### Scenario: Integration test scenarios

- **GIVEN** integration tests verify end-to-end flows
- **WHEN** running integration tests
- **THEN** the following complete flows SHALL be tested:
  - Simple text conversation (User → LLM → Response)
  - Conversation with file references
  - Conversation with single tool call
  - Conversation with multiple tool calls
  - Auto-loop with 3+ iterations
  - Branch switching during conversation
  - Context compression during conversation
  - Error and recovery
  - Pausing and resuming
- **AND** each flow SHALL verify state sequences
- **AND** message integrity SHALL be verified

#### Scenario: Performance testing

- **GIVEN** performance is critical
- **WHEN** running performance tests
- **THEN** the following SHALL be measured:
  - State transition latency (<10ms)
  - Message addition time (<50ms)
  - Context optimization time (<500ms for 1000 messages)
  - Storage save time (<200ms for typical context)
  - Tool execution overhead (<10ms)
- **AND** performance regressions SHALL be detected
- **AND** benchmarks SHALL be reproducible

## REMOVED Requirements

### Requirement: Direct message_pool manipulation

**Reason**: Direct manipulation of message_pool bypasses the processing pipeline and can lead to inconsistent state.

**Migration**: All code that directly inserts into message_pool must be updated to use add_message_to_branch, which properly processes messages through the pipeline.

### Requirement: Static tool call handling in InternalMessage

**Reason**: The new MessageType system provides a better abstraction for tool calls through ToolRequest and ToolResult types.

**Migration**: Code checking for `message.tool_calls.is_some()` should be updated to match on `message.message_type` and handle the `MessageType::ToolRequest` and `MessageType::ToolResult` variants explicitly.

