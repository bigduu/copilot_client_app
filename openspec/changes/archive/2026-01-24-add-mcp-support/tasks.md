## 1. Implementation

- [x] 1.1 Add MCP config storage in `~/.bodhi/mcp_servers.json` with read/write helpers and validation.
- [x] 1.2 Build MCP server manager lifecycle (start/stop/refresh) and status tracking in the backend.
- [x] 1.3 Poll MCP config from the frontend; backend serves config updates on `GET /mcp/servers`.
- [x] 1.4 Add HTTP endpoints: `GET /mcp/servers`, `POST /mcp/servers`, `POST /mcp/reload`, `GET /mcp/status/{name}`.
- [x] 1.5 Integrate MCP tool discovery/execution into the tool pipeline (LLM tool calls route to MCP).
- [x] 1.6 Add MCP server management UI (list, edit, enable/disable, status) wired to backend endpoints.
- [x] 1.7 Add tests for MCP config parsing, endpoints, and tool execution routing.
- [x] 1.8 Update docs for MCP configuration and UI usage.
