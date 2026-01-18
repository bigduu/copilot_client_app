## Architecture Overview

This change adds a new "Agent" mode to Bodhi that integrates the local Claude Code CLI while keeping the existing "Chat" mode unchanged.

- **Chat mode**: continues to use the existing local HTTP backend (`crates/web_service`) and OpenAI-compatible endpoints.
- **Agent mode**: uses **Tauri commands + Tauri events** to:
  - read Claude Code local state under `~/.claude/`
  - spawn/stream the `claude` CLI (`--output-format stream-json`)
  - surface output to the UI in real time

This mirrors opcode's proven approach: Claude Code is a local CLI tool with a local data directory, so the tightest integration is in the desktop runtime (Tauri), not the headless HTTP service.

## Data Model

Agent mode requires three primary concepts:

1) **Project**
- Derived from directories under `~/.claude/projects/`
- Canonical project path SHOULD be inferred by reading JSONL entries and extracting a non-empty `cwd`

2) **Session**
- A JSONL file under a project directory (file stem is a session ID)
- Metadata (first user message, created/modified time) is derived by scanning the JSONL

3) **Run / Live Execution**
- A spawned `claude` process producing JSONL on stdout
- A session ID is discovered from the `system:init` message

## Backend (Tauri) Design

### Commands
- `claude_*` commands for:
  - binary discovery (`which`/common paths/NVM/Homebrew) with optional manual override
  - project/session listing and file reading
  - execute/continue/resume and cancel

### Streaming Strategy (Events)
- Emit both a generic event and a session-scoped event:
  - Generic: `claude-output`, `claude-error`, `claude-complete`
  - Scoped: `claude-output:<session_id>`, `claude-error:<session_id>`, `claude-complete:<session_id>`

Rationale:
- Claude Code may emit a different `session_id` than the one supplied via `--resume`.
- The UI must always start by listening to the **generic** channel to capture the first `system:init`.
- After `session_id` is known, the UI switches to scoped events to prevent duplicates and isolate sessions.

### Process Management
- Track the running Child process in state and support best-effort cancellation.
- Cancellation must always emit cancelled/complete events so the UI does not get stuck in a loading state.

### Security / Permissions
- Default behavior MUST NOT pass `--dangerously-skip-permissions`.
- The UI may enable it explicitly per run; the backend only includes it when requested.

## Frontend Design

### Mode Switch
- A single persisted state controls whether `MainLayout` renders Chat or Agent UI.
- Switching modes must preserve both modes' state (no destructive resets).

### Agent UI Responsibilities
- Load projects/sessions via Tauri commands.
- Start listeners before invoking execution commands:
  - attach generic listeners first
  - parse init message, then attach scoped listeners
- Render stream-json output as a structured message timeline.

## Compatibility Notes
- This change intentionally does not retrofit Claude Code into the existing chat state machine. Agent sessions are modeled separately because:
  - Claude Code emits rich tool-use/step events not aligned with OpenAI chat completion messages
  - Session identity is CLI-defined (`session_id`) and stored in JSONL files
