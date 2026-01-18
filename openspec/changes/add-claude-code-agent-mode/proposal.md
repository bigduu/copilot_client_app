## Why
Bodhi currently provides a chat-focused UI, but it does not offer a first-class GUI for interacting with Claude Code CLI sessions (projects, session history, resume, and live streaming output). Integrating Claude Code in an "Agent" mode enables workflow-style development sessions while keeping the existing chat experience intact.

## What Changes
- Add a top-level UI mode switch: `Chat` and `Agent`, with separate screens and state.
- Add an `Agent` mode UI that:
  - Browses Claude Code projects and sessions by reading `~/.claude/projects/**.jsonl`
  - Starts new sessions, continues, and resumes sessions by ID
  - Shows live streaming output and errors
  - Supports cancelling an in-flight Claude Code execution
- Add Tauri backend commands to:
  - Discover the `claude` binary (auto-discovery) with optional manual override
  - List projects/sessions and load session output from disk
  - Spawn Claude Code with `--output-format stream-json` and stream output to the UI via Tauri events
- Add a per-run "Skip Permissions" toggle in the Agent UI:
  - Default is **OFF**
  - When ON, invoke Claude Code with `--dangerously-skip-permissions`

## Impact
- Affected code:
  - Frontend: `src/layouts/MainLayout.tsx` (mode switch + conditional layout), new Agent components/state
  - Tauri backend: `src-tauri/src/lib.rs` (invoke handler), new `src-tauri/src/command/claude_code.rs` (commands + process mgmt)
- No breaking changes to the existing Chat mode API surface; Chat remains backed by the existing `/v1` HTTP service.
