## 1. Proposal Validation
- [ ] 1.1 Run `openspec validate add-claude-code-agent-mode --strict` and fix all findings

## 2. Backend (Tauri) - Claude Code Integration
- [ ] 2.1 Add Claude Code binary discovery with optional manual override (persisted)
- [ ] 2.2 Implement filesystem readers for:
  - `~/.claude/projects` project listing
  - sessions list per project
  - loading session JSONL content / first-user-message extraction
- [ ] 2.3 Implement commands to run Claude Code:
  - start new (`-p`)
  - continue (`-c -p`)
  - resume (`--resume <id> -p`)
  - include `--output-format stream-json --verbose`
  - include `--dangerously-skip-permissions` only when explicitly enabled
- [ ] 2.4 Implement streaming via Tauri events:
  - emit `claude-output` (generic) and `claude-output:<session_id>` (scoped)
  - emit `claude-error` / `claude-error:<session_id>`
  - emit `claude-complete` / `claude-complete:<session_id>`
- [ ] 2.5 Implement cancellation command:
  - best-effort kill of the spawned process
  - always emits cancelled/complete events for UI consistency
- [ ] 2.6 Add Rust-focused tests for parsing/extraction helpers (at least):
  - first-user-message extraction ignores non-user/boilerplate lines
  - safe project/session path handling does not allow path traversal

## 3. Frontend - Mode Switch
- [ ] 3.1 Add global mode state (`Chat` | `Agent`) with persisted preference
- [ ] 3.2 Update `MainLayout` to render Chat UI or Agent UI based on mode
- [ ] 3.3 Ensure Chat state is preserved when toggling away and back

## 4. Frontend - Agent UI (Claude Code)
- [ ] 4.1 Add Agent sidebar/browser:
  - project list
  - session list for selected project
  - actions: new / continue / resume
- [ ] 4.2 Add Agent session view:
  - prompt input
  - model selector
  - "Skip Permissions" toggle (default OFF, with warning text)
  - live stream rendering of JSONL events
  - cancel button
- [ ] 4.3 Implement "generic listener first, then switch to scoped listener" strategy to avoid missing streams when `session_id` changes
- [ ] 4.4 Add TypeScript tests for stream-json parsing/render mapping (Vitest)

## 5. End-to-End Validation
- [ ] 5.1 Manual smoke test in Tauri dev:
  - list projects/sessions from a real `~/.claude`
  - start + continue + resume
  - cancel mid-stream
  - toggle Chat/Agent back and forth
