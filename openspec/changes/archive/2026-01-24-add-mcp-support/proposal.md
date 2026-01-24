## Why

Copilot Chat includes MCP scaffolding but lacks end-to-end MCP server management and tool execution. Users need to configure MCP servers in `~/.bodhi`, toggle them on/off, and execute MCP tools through the agent loop.

## What Changes

- Add MCP server management (list, edit, enable/disable) backed by `~/.bodhi/mcp_servers.json` and a file watcher.
- Expose MCP server status and configuration via HTTP endpoints used by the frontend.
- Integrate MCP tool discovery/execution into the backend tool pipeline.
- Provide a frontend UI to manage MCP servers and reflect live config updates.

## Impact

- Affected specs: `mcp-server-management`, `mcp-tool-execution`
- Affected code: `crates/mcp_client`, `crates/web_service`, `src-tauri`, `src/services`, `src/components`
