## Why

The backend is being reduced to a stateless request-forwarding proxy. The current workspace still
includes server-side state/session/context/tool execution crates that add maintenance cost and
architectural confusion.

## What Changes

- **BREAKING** Remove server-side stateful domain crates: `session_manager`, `chat_state`,
  `context_manager`, `tool_system`.
- **BREAKING** Remove all server-side endpoints/features that require those crates (sessions,
  contexts, tool execution/approval, agent loop, workflows). Backend keeps forwarding-only
  endpoints: `GET /v1/models`, `POST /v1/chat/completions`, `POST /v1/messages`, `POST /v1/complete`.
- Update docs to reflect the simplified backend responsibilities.

## Impact

- Affected specs: backend-forwarder (new delta)
- Affected code: `Cargo.toml` (workspace members), `crates/web_service`, `src-tauri`, and removed
  crates under `crates/`.
