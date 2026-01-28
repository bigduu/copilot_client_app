## Context

The backend previously attempted to host an agent loop and context tree, but the
complexity and overlap with frontend state made it hard to maintain. We want a
stateless backend that forwards requests and provides local bridge services, with
agent orchestration owned by the frontend.

## Goals / Non-Goals

- Goals:
  - Move agent orchestration to the frontend runtime.
  - Remove deprecated backend agent/context/message modules and any backend agent state.
  - Keep `chat_core` focused on `todo` types and global backend config.
  - Keep backend APIs stateless and focused on forwarding/bridging.
- Non-Goals:
  - Redesign the frontend agent architecture in this change.
  - Introduce new backend storage or persistence layers.

## Decisions

- Decision: The agent loop runs in the frontend; backend crates do not host or
  depend on `chat_core` agent/context/message modules. `chat_core` remains for
  `todo` and global config.
- Decision: Global backend config lives in `chat_core` and is shared across backend
  crates instead of per-crate config implementations.
- Decision: MCP tool execution remains available via backend bridging, but results
  are returned to the frontend agent runtime instead of a backend agent loop.
- Decision: Remove or relocate deprecated backend crates into `crates/deprecated`
  and update the workspace membership accordingly.

## Risks / Trade-offs

- Risk: Existing backend or tests may still depend on `chat_core` agent/context/message
  types. Mitigation: inventory dependencies first, then remove/replace in sequence.
- Risk: Ongoing proposal work (e.g., agent sessions) may conflict. Mitigation:
  reconcile or close conflicting proposals before implementation.

## Migration Plan

1. Audit backend crates for agent/context/message dependencies.
2. Remove or relocate deprecated modules and update exports.
3. Update backend/Tauri commands and MCP tool handling to accept frontend-driven calls.
4. Update tests and remove outdated fixtures.

## Open Questions

- Which config fields and persistence locations should be considered stable API
  for other backend crates?
