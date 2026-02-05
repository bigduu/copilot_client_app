# mcp-tool-execution Specification

## REMOVED Requirements

### Requirement: MCP tool discovery

**Reason**: MCP tool discovery is removed; tools are built-in only.
**Migration**: Use built-in tool schemas from the app runtime.

#### Scenario: Built-in tool discovery only

- **WHEN** tools are discovered
- **THEN** only built-in tools are registered

### Requirement: MCP tool execution

**Reason**: MCP tool execution is removed.
**Migration**: Remove MCP tool calls and rely on built-in tools.

#### Scenario: MCP tool calls rejected

- **WHEN** a tool call targets `example::search`
- **THEN** the call fails because MCP tool execution is removed

### Requirement: MCP tool error handling

**Reason**: MCP tool execution is removed, so MCP error handling no longer applies.
**Migration**: Remove MCP-specific error handling paths.

#### Scenario: No MCP error paths

- **WHEN** a tool call fails
- **THEN** the system does not reference MCP server status
