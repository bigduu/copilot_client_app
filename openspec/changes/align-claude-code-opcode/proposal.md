## Why
Bodhi's Claude Code Agent mode should match opcode's backend surface and frontend sync behavior so the GUI can reliably browse projects/sessions, stream output, recover sessions, and expose the richer Claude Code session tooling that opcode provides.

## What Changes
- Align Tauri Claude Code commands and response shapes with opcode (project/session APIs, execution lifecycle, running session queries, live output fetch).
- Add process registry + live output cache for Claude sessions, mirroring opcode behavior.
- Replace Bodhi's Claude binary discovery with opcode's multi-install discovery and persisted selection.
- Update Agent UI to use opcode's sync logic (generic-to-scoped listeners, session-id rebind, reconnect) and add opcode's Claude session UX features (queued prompts, session persistence, timeline/checkpoints, slash commands, preview).

## Impact
- Backend (Tauri): new `process` registry module, new `claude_binary` module, expanded `claude_code` commands, updated Tauri invoke list.
- Frontend: `AgentView`, new/updated session components/hooks, `ClaudeCodeService` (or new API wrapper) to match opcode command names.
- Potential breaking: existing `skipPermissions` toggle and command names will be replaced by opcode-compatible behavior; we will keep legacy command aliases where feasible.
