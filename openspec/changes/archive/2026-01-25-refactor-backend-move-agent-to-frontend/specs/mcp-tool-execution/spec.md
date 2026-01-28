## MODIFIED Requirements

### Requirement: MCP tool execution

The system SHALL execute MCP tool calls by routing the tool request to the
configured MCP server and returning the tool result to the frontend agent runtime.

#### Scenario: Execute an MCP tool call from the frontend agent

- **WHEN** the frontend agent issues a tool call to `example::search` with parameters
- **THEN** the system routes the request to the `example` MCP server and returns the
  result to the frontend agent runtime
