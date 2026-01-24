## Context

Bodhi already includes a minimal Claude Code Agent mode backed by Tauri commands. opcode has a more complete Claude Code GUI with a richer backend surface (process registry, running session output cache, project creation) and frontend sync logic that tolerates session-id changes during streaming. We need to bring Bodhi to opcode parity without replacing the overall Bodhi layout.

## Goals / Non-Goals

- Goals:
  - Match opcode's Tauri command names and behaviors for Claude Code session management.
  - Introduce process registry and live output caching for Claude sessions.
  - Provide opcode-style frontend sync logic and session UX features.
  - Keep Chat mode unchanged.
- Non-Goals:
  - Port opcode's CC Agents (custom agent library) UI or backend.
  - Redesign Bodhi's overall navigation or visual style.

## Decisions

- Decision: Implement an opcode-style `process` registry in `src-tauri/src/process` and wire Claude session execution to register/run/unregister and cache live output.
- Decision: Add a `claude_binary` module mirroring opcode's discovery behavior and persist user selection in a local SQLite `agents.db` (same layout as opcode) stored in Tauri app data.
- Decision: Expose opcode-compatible commands and keep legacy Bodhi command names as lightweight aliases to reduce breakage.
- Decision: Rework Agent mode to use opcode's generic-to-scoped listener flow and session-id rebinding, while keeping the Agent layout shell.
- Decision: Implement opcode Claude session UX features in Agent mode using new components/hooks, but keep them scoped to Claude Code sessions only.

## Risks / Trade-offs

- Introducing SQLite for settings adds a new dependency and storage file.
- Adding multiple session-related features may require incremental rollout; tasks are split to enable staged verification.

## Migration Plan

- Add new Tauri commands and registry with backward-compatible aliases.
- Update frontend service layer to call opcode command names; keep fallbacks for legacy until features stabilize.
- Replace Agent streaming logic with opcode sync flow.

## Open Questions

- None (user confirmed opcode parity, command names, and UX features).
