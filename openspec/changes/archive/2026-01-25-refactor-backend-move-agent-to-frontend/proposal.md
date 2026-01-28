## Why

The backend agent loop grew too complex and overlaps with frontend responsibilities.
Moving agent orchestration to the frontend simplifies the Rust backend, removes
unused/deprecated modules (agent/context/message), and aligns with a stateless
backend-forwarder architecture.

## What Changes

- Move agent orchestration (roles, context tree, message handling) to the frontend runtime.
- Remove or deprecate backend agent/context/message modules from `chat_core` while keeping `todo`.
- Move global backend configuration from `copilot_client` into `chat_core` so core owns config
  loading and access.
- Trim backend crates and APIs that assume server-side agent state.
- Keep the backend HTTP service stateless; agent state is frontend-owned.
- Route MCP tool execution on behalf of the frontend agent runtime and return results
  to the frontend.
- **BREAKING**: any backend APIs or modules tied to agent contexts are removed.

## Impact

- Affected specs: backend-legacy-cleanup, mcp-tool-execution, backend-config
- Affected code: crates/chat_core, crates/copilot_client, crates/deprecated,
  crates/mcp_client, crates/web_service, src-tauri
