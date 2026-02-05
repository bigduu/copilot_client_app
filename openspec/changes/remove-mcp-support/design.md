## Context

The current system supports MCP servers for tool discovery and execution. We want to remove MCP entirely and rely only on built-in tools provided by the app runtime.

## Goals / Non-Goals

- Goals:
  - Remove all MCP dependencies from runtime, UI, and configuration.
  - Ensure tool lists are derived only from built-in executors.
  - Keep Markdown skill support, but limit tool_refs to built-in tools.
- Non-Goals:
  - Replacing MCP with another external tool protocol.
  - Adding new tools beyond the existing built-in set.

## Decisions

- Decision: Remove MCP server management and tool execution end-to-end.
- Decision: Treat built-in tools as the only source of tool schemas.
- Decision: Keep Markdown skills and validate tool_refs against built-in tool names.

## Risks / Trade-offs

- Loss of external tool extensibility → accepted for simplicity and lower operational risk.
- Breaking API/UI changes → require clear migration note in docs.

## Migration Plan

1. Remove MCP runtime, endpoints, and config file usage.
2. Remove frontend MCP settings UI and sample config.
3. Update tool filtering to use built-in tools only.
4. Update docs and tests.

## Open Questions

- Should we delete MCP-related crates entirely or leave stubs for future reintroduction?
