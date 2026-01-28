# mcp-tool-execution Specification

## Purpose

TBD - created by archiving change add-mcp-support. Update Purpose after archive.
## Requirements
### Requirement: MCP tool discovery

The system SHALL discover tools from enabled MCP servers and register them in the tool pipeline using a namespaced format to avoid collisions.

#### Scenario: Namespaced tool registration

- **WHEN** an MCP server named `example` exposes a tool `search`
- **THEN** the tool is registered as `example::search`

### Requirement: MCP tool execution

The system SHALL execute MCP tool calls by routing the tool request to the
configured MCP server and returning the tool result to the frontend agent runtime.

#### Scenario: Execute an MCP tool call from the frontend agent

- **WHEN** the frontend agent issues a tool call to `example::search` with parameters
- **THEN** the system routes the request to the `example` MCP server and returns the
  result to the frontend agent runtime

### Requirement: MCP tool error handling

The system SHALL return a tool error when an MCP tool call targets a missing or disabled server, or when the MCP invocation fails.

#### Scenario: Disabled server tool call

- **WHEN** the agent issues a tool call to a tool hosted by a disabled MCP server
- **THEN** the tool call fails with a clear error describing that the server is disabled

