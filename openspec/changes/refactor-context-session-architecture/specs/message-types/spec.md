## ADDED Requirements

### Requirement: Unified Message Type Enumeration

The system SHALL define a strongly-typed enumeration for all message types, making message handling explicit and type-safe.

#### Scenario: Text message representation

- **GIVEN** a plain text message from user or assistant
- **WHEN** the message is created
- **THEN** it SHALL be represented as MessageType::Text
- **AND** the text content SHALL be stored in a TextMessage struct
- **AND** the struct SHALL include role (User/Assistant/System)
- **AND** the struct SHALL support multiple content parts

#### Scenario: Image message representation

- **GIVEN** a user sends an image for analysis
- **WHEN** the image message is created
- **THEN** it SHALL be represented as MessageType::Image
- **AND** the image data SHALL be stored (URL, Base64, or FilePath)
- **AND** the recognition mode SHALL be specified (Vision/OCR/Auto)
- **AND** space for recognition results SHALL be provided
- **AND** errors SHALL be captured if recognition fails

#### Scenario: File reference message representation

- **GIVEN** a user references a file in their message
- **WHEN** the file reference is parsed
- **THEN** it SHALL be represented as MessageType::FileReference
- **AND** the file path SHALL be stored
- **AND** optional line range SHALL be stored (start_line, end_line)
- **AND** the resolved content SHALL be stored after processing
- **AND** the resolution status SHALL be tracked

#### Scenario: Tool request message representation

- **GIVEN** an LLM wants to invoke one or more tools
- **WHEN** the tool request is received
- **THEN** it SHALL be represented as MessageType::ToolRequest
- **AND** each tool call SHALL have a unique ID
- **AND** tool name and arguments SHALL be structured
- **AND** approval status SHALL be tracked (Pending/Approved/Denied)
- **AND** multiple tool calls MAY be in a single message

#### Scenario: Tool result message representation

- **GIVEN** a tool execution completes
- **WHEN** the result is ready
- **THEN** it SHALL be represented as MessageType::ToolResult
- **AND** the result SHALL reference the tool request ID
- **AND** the result content SHALL be stored
- **AND** success or error status SHALL be indicated
- **AND** execution metadata (duration, timestamp) SHALL be included

#### Scenario: System control message representation

- **GIVEN** the system needs to inject control information
- **WHEN** creating a system message
- **THEN** it SHALL be represented as MessageType::SystemControl
- **AND** the control type SHALL be specified (e.g., ModeChange, BranchSwitch)
- **AND** control parameters SHALL be structured
- **AND** the message SHALL not be sent to the LLM

#### Scenario: MCP resource message representation

- **GIVEN** an MCP server provides a resource to be injected into context
- **WHEN** the resource message is created
- **THEN** it SHALL be represented as MessageType::MCPResource
- **AND** the server_name SHALL identify the source MCP server
- **AND** the resource_uri SHALL identify the resource
- **AND** the content SHALL contain the resource data
- **AND** the mime_type SHALL indicate content type (if provided)
- **AND** the retrieved_at timestamp SHALL be recorded

### Requirement: Message Type Serialization

All message types SHALL be serializable to and deserializable from JSON with version compatibility.

#### Scenario: Serializing message with type tag

- **GIVEN** a message with any MessageType
- **WHEN** serializing to JSON
- **THEN** the JSON SHALL include a "type" field indicating the variant
- **AND** the variant-specific data SHALL be nested
- **AND** the serialized form SHALL be human-readable
- **AND** the schema SHALL be documented

#### Scenario: Deserializing with unknown type

- **GIVEN** a JSON message with an unknown type tag
- **WHEN** attempting to deserialize
- **THEN** deserialization SHALL not fail
- **AND** the message SHALL be parsed as a fallback type (e.g., Unknown)
- **AND** the original JSON SHALL be preserved
- **AND** a warning SHALL be logged

#### Scenario: Version migration

- **GIVEN** a message serialized with an older schema version
- **WHEN** deserializing in a newer version
- **THEN** the message SHALL be automatically migrated
- **AND** missing fields SHALL be filled with defaults
- **AND** deprecated fields SHALL be ignored
- **AND** the migration SHALL be transparent to the caller

### Requirement: File Reference Processing

File reference messages SHALL be resolved into their actual content before being sent to the LLM.

#### Scenario: Resolving absolute file path

- **GIVEN** a FileReference message with an absolute path
- **WHEN** the message is processed
- **THEN** the file SHALL be read from the filesystem
- **AND** the content SHALL be stored in the message
- **AND** if the file does not exist, an error SHALL be returned
- **AND** the resolution SHALL respect agent permissions

#### Scenario: Resolving relative file path

- **GIVEN** a FileReference message with a relative path
- **WHEN** the message is processed
- **THEN** the path SHALL be resolved relative to the workspace root
- **AND** the file SHALL be read from the resolved path
- **AND** if workspace root is not set, an error SHALL be returned

#### Scenario: Resolving file with line range

- **GIVEN** a FileReference message with start_line and end_line
- **WHEN** the message is processed
- **THEN** only the specified lines SHALL be extracted
- **AND** line numbers SHALL be 1-indexed
- **AND** if the range is invalid, an error SHALL be returned
- **AND** the extracted content SHALL be clearly marked with line numbers

#### Scenario: Permission check for file access

- **GIVEN** a FileReference message and an agent with Planner role
- **WHEN** attempting to read a file
- **THEN** the agent's permissions SHALL be checked
- **AND** Planner role SHALL be allowed to read files
- **AND** unauthorized access SHALL be denied
- **AND** a permission error SHALL be returned

### Requirement: Tool Request Processing

Tool request messages SHALL be processed according to approval policies and executed when approved.

#### Scenario: Parsing tool request from LLM response

- **GIVEN** an LLM response containing tool_calls in OpenAI format
- **WHEN** parsing the response
- **THEN** a MessageType::ToolRequest SHALL be created
- **AND** each tool_call SHALL be extracted into a ToolCall struct
- **AND** tool call IDs SHALL be preserved
- **AND** arguments SHALL be parsed as JSON

#### Scenario: Single tool request

- **GIVEN** a ToolRequest message with one tool call
- **WHEN** processing the request
- **THEN** the tool's approval status SHALL be checked
- **AND** if approved, the tool SHALL be executed
- **AND** the execution result SHALL be captured
- **AND** a ToolResult message SHALL be created

#### Scenario: Multiple tool requests

- **GIVEN** a ToolRequest message with multiple tool calls
- **WHEN** processing the request
- **THEN** all tool calls SHALL be processed in order
- **AND** each tool MAY have a different approval status
- **AND** approved tools SHALL execute concurrently (if safe)
- **AND** one ToolResult message SHALL be created per executed tool

#### Scenario: Tool request approval workflow

- **GIVEN** a ToolRequest with approval_status = Pending
- **WHEN** user review is required
- **THEN** the request SHALL be presented to the user
- **AND** the user SHALL be able to approve or deny each tool call
- **AND** the approval status SHALL be updated in the message
- **AND** the message SHALL be marked dirty for persistence

### Requirement: Tool Result Handling

Tool result messages SHALL properly link back to their originating requests and provide structured output.

#### Scenario: Successful tool execution

- **GIVEN** a tool executes successfully
- **WHEN** creating the ToolResult message
- **THEN** the result SHALL reference the original tool request ID
- **AND** the status SHALL be Success
- **AND** the output SHALL be stored as structured JSON
- **AND** execution metadata SHALL be included

#### Scenario: Tool execution error

- **GIVEN** a tool fails during execution
- **WHEN** creating the ToolResult message
- **THEN** the result SHALL reference the original tool request ID
- **AND** the status SHALL be Error
- **AND** the error message SHALL be stored
- **AND** the stack trace SHALL be included (if available)
- **AND** the error SHALL be marked as recoverable or not

#### Scenario: Feeding tool results back to LLM

- **GIVEN** one or more ToolResult messages exist
- **WHEN** preparing the next LLM request
- **THEN** ToolResult messages SHALL be formatted according to the LLM API spec
- **AND** results SHALL be associated with their tool_call_ids
- **AND** results SHALL be in the correct position in the message history
- **AND** the LLM SHALL be able to use the results to continue

### Requirement: System Control Messages

System control messages SHALL manage internal state transitions without being exposed to the LLM.

#### Scenario: Mode change control message

- **GIVEN** the context switches from Plan mode to Act mode
- **WHEN** a SystemControl message is created
- **THEN** the message type SHALL be SystemControl::ModeChange
- **AND** the old and new modes SHALL be recorded
- **AND** the message SHALL be added to the context history
- **AND** the message SHALL not be included in LLM requests
- **AND** the system prompt SHALL be updated accordingly

#### Scenario: Branch switch control message

- **GIVEN** the active branch is changed
- **WHEN** a SystemControl message is created
- **THEN** the message type SHALL be SystemControl::BranchSwitch
- **AND** the old and new branch names SHALL be recorded
- **AND** the message SHALL mark the transition point in history
- **AND** the message SHALL be used for auditing

### Requirement: Image Message Processing

Image messages SHALL support both Vision-based and OCR-based recognition with automatic fallback when Vision is not available.

#### Scenario: Vision recognition with supported model

- **GIVEN** an image message with recognition_mode set to Vision
- **WHEN** the LLM supports vision capabilities (e.g., GPT-4V, Claude 3)
- **THEN** the image SHALL be sent to the LLM's vision API
- **AND** the analysis result SHALL be stored in vision_analysis field
- **AND** the recognition SHALL include image description and text extraction
- **AND** the result SHALL be available for subsequent messages

#### Scenario: OCR recognition

- **GIVEN** an image message with recognition_mode set to OCR
- **WHEN** the image is processed
- **THEN** an OCR engine (e.g., Tesseract) SHALL be used
- **AND** extracted text SHALL be stored in recognized_text field
- **AND** the OCR confidence score SHALL be recorded in metadata
- **AND** language detection SHALL be attempted

#### Scenario: Auto mode with vision support

- **GIVEN** an image message with recognition_mode set to Auto
- **WHEN** the current LLM supports vision
- **THEN** Vision recognition SHALL be attempted first
- **AND** if Vision succeeds, OCR SHALL be skipped
- **AND** if Vision fails, OCR SHALL be used as fallback
- **AND** the actual mode used SHALL be recorded

#### Scenario: Auto mode without vision support

- **GIVEN** an image message with recognition_mode set to Auto
- **WHEN** the current LLM does NOT support vision
- **THEN** OCR SHALL be used directly
- **AND** a message SHALL indicate that Vision is unavailable
- **AND** the user SHALL be informed of the fallback

#### Scenario: Image processing error handling

- **GIVEN** an image message being processed
- **WHEN** recognition fails (network error, invalid format, etc.)
- **THEN** the error SHALL be captured in the error field
- **AND** the message state SHALL be marked as failed
- **AND** the user SHALL receive a clear error message
- **AND** retry options SHALL be provided

#### Scenario: Image message sent to LLM

- **GIVEN** an image message with successful recognition
- **WHEN** preparing the context for LLM
- **THEN** if using Vision, the image SHALL be included in multimodal format
- **AND** if using OCR, the recognized text SHALL be sent as text content
- **AND** internal metadata SHALL be preserved but not sent to LLM
- **AND** the image data format SHALL match the LLM's requirements

### Requirement: MCP Resource Message Handling

MCP resource messages SHALL enable seamless integration of external context from MCP servers into the conversation.

#### Scenario: Injecting MCP resource into context

- **GIVEN** an MCP server provides a useful resource (e.g., database schema, API documentation)
- **WHEN** the resource is requested for injection
- **THEN** an MCPResource message SHALL be created
- **AND** the resource content SHALL be retrieved from the MCP server
- **AND** the message SHALL be added to the active branch
- **AND** the resource SHALL be available for LLM to reference
- **AND** the injection SHALL be transparent to the LLM

#### Scenario: Resource content formatting

- **GIVEN** an MCP resource has been retrieved
- **WHEN** formatting for LLM consumption
- **THEN** the content SHALL be included in the context
- **AND** resource metadata SHALL be preserved internally
- **AND** the LLM SHALL see the content as system-provided information
- **AND** large resources MAY be summarized to fit token limits

#### Scenario: Resource caching

- **GIVEN** an MCP resource has been retrieved
- **WHEN** the same resource is requested again in the same context
- **THEN** the cached content SHALL be used
- **AND** the retrieval timestamp SHALL be checked for freshness
- **AND** if stale (e.g., >1 hour), the resource MAY be re-retrieved
- **AND** cache behavior SHALL be configurable per resource type

#### Scenario: MCP resource in message history

- **GIVEN** a context contains MCPResource messages
- **WHEN** optimizing context for LLM
- **THEN** resource messages SHALL be considered for inclusion
- **AND** recently accessed resources SHALL be prioritized
- **AND** unused resources MAY be removed if token limit is reached
- **AND** resource removal SHALL be logged

### Requirement: Message Type Validation

All message types SHALL be validated to ensure data integrity and consistency.

#### Scenario: Validating text message

- **GIVEN** a TextMessage is created
- **WHEN** validation is performed
- **THEN** the content SHALL not be empty (unless explicitly allowed)
- **AND** the role SHALL be one of the valid roles
- **AND** content parts SHALL be validated individually

#### Scenario: Validating file reference message

- **GIVEN** a FileReference message is created
- **WHEN** validation is performed
- **THEN** the file path SHALL not be empty
- **AND** if line range is provided, end_line SHALL be >= start_line
- **AND** the file path SHALL not contain path traversal (../)
- **AND** the file path SHALL be normalized

#### Scenario: Validating tool request message

- **GIVEN** a ToolRequest message is created
- **WHEN** validation is performed
- **THEN** each tool call SHALL have a non-empty ID
- **AND** each tool call SHALL have a valid tool name
- **AND** tool arguments SHALL be valid JSON
- **AND** approval status SHALL be a valid enum value

## REMOVED Requirements

None. This is a new capability spec.

