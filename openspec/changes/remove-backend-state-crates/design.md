# Design: Stateless Backend Forwarder

## Goal
Make the Rust backend a thin, stateless proxy that forwards API requests to upstream model
providers, without managing conversation state, sessions, or tool execution.

## Current State (Problem)
`crates/web_service` currently composes several stateful domain crates:
- `context_manager`: context/message persistence and processing pipelines
- `session_manager`: session persistence and context lookup
- `chat_state`: FSM/state machine logic
- `tool_system`: tool registry/execution and approval flows

This is at odds with the new backend role ("pure forwarding") and increases compile time and
maintenance surface area.

## Target State
- The backend does not persist chat contexts or sessions.
- The backend does not execute tools, manage approvals, or run agent loops.
- The backend exposes only the minimal "forwarding" endpoints needed by the frontend (exact surface
  to be confirmed in the proposal tasks before implementation).

## Scope Boundaries / Open Questions
- Backend keeps only forwarding endpoints: `GET /v1/models`, `POST /v1/chat/completions`,
  `POST /v1/messages`, `POST /v1/complete`.
- Tools/approvals/workflows/sessions/contexts/agent-loop endpoints are removed server-side.

## Approach (Minimal, Stepwise)
1. Inventory usages of the four crates from `web_service` and `src-tauri`.
2. Remove web service controllers/services that depend on them, keeping only forwarding controllers.
3. Remove the crates from workspace members, delete their directories, and update docs.
4. Validate via `cargo check` (and targeted tests where still applicable).
