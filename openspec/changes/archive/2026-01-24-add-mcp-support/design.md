## Context

The project includes MCP client scaffolding and a sample `src-tauri/mcp_servers.json`, but there is no end-to-end MCP server management, no backend endpoints for MCP config/status, and no MCP tool execution path wired into the agent/tool pipeline. The frontend already calls `/mcp/servers` and `/mcp/status/:name` via HTTP, but those endpoints are missing.

## Goals / Non-Goals

- Goals:
  - Centralize MCP configuration in `~/.bodhi/mcp_servers.json`.
  - Support manual enable/disable via UI and direct file edits.
  - Auto-reload MCP config changes without restart.
  - Execute MCP tools through the existing tool pipeline.
- Non-Goals:
  - Implement a remote MCP registry or marketplace.
  - Replace the existing tool approval model (only integrate with it).

## Decisions

- Source of truth is `~/.bodhi/mcp_servers.json`, using the existing MCP schema (`mcpServers` map).
- If the config file is missing, create it with a minimal template (`{"mcpServers":{}}`).
- The backend loads MCP config on startup and applies changes only when the frontend saves updates or calls reload.
- The frontend polls the backend for config changes and triggers reload when it detects updates.
- Disabled servers are not started and are excluded from tool discovery/execution.
- MCP tools are referenced as `server::tool` names in the tool pipeline to avoid name collisions.
- MCP configuration is edited via a raw JSON editor in the UI.

## Alternatives Considered

- Storing MCP config in app data DB instead of a file. Rejected to keep manual editing simple and align with the request.
- Reloading only on explicit user action. Rejected to support direct file edits without restarting.

## Risks / Trade-offs

- Hot-reload can interrupt in-flight MCP tool calls. Mitigation: keep running clients alive until new config is applied, and surface clear errors if a call races a restart.
- Multiple writers (UI + manual edits) may cause conflicts. Mitigation: last-write-wins and UI refresh on backend updates.

## Migration Plan

- If `~/.bodhi/mcp_servers.json` is missing, treat configuration as empty and create the file on first write.
- Keep `src-tauri/mcp_servers.json` as a sample/default, not a runtime source of truth.

## Open Questions

- How should MCP tool calls integrate with the existing approval flow?
