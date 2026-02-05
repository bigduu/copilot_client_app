## Why

MCP-based tooling adds operational overhead and is no longer needed for this product. We want a simpler, built-in tool system only.

## What Changes

- **BREAKING** Remove MCP server management, configuration, and status APIs.
- **BREAKING** Remove MCP tool discovery/execution and MCP runtime wiring.
- Restrict skills to built-in tool references only.
- Remove MCP-related UI, docs, and sample config files.

## Impact

- Affected specs: mcp-server-management, mcp-tool-execution
- Affected code: web_service MCP runtime/controllers, frontend MCP settings UI, mcp_client crate, copilot-agent MCP client/runtime, MCP docs and sample config
