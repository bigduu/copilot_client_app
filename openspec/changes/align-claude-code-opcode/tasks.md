## 1. Backend (Tauri) Parity
- [x] 1.1 Add `process` registry module (Claude sessions, live output cache) and wire state management
- [x] 1.2 Add `claude_binary` module with discovery + persisted selection using SQLite `agents.db`
- [x] 1.3 Implement opcode-compatible commands: `list_projects`, `create_project`, `get_project_sessions`, `load_session_history`
- [x] 1.4 Update Claude execution commands to register sessions, emit scoped events, and cache live output
- [x] 1.5 Implement `list_running_claude_sessions` and `get_claude_session_output`
- [x] 1.6 Add legacy command aliases (`list_claude_projects`, `list_project_sessions`, `get_session_jsonl`) that forward to opcode equivalents

## 2. Frontend Service Layer
- [x] 2.1 Update Claude service API to call opcode command names and consume updated shapes
- [x] 2.2 Add running-session fetch + live-output fetch helpers
- [x] 2.3 Remove skip-permissions toggle in Agent UI (backend always skips)

## 3. Frontend Agent UI
- [x] 3.1 Port opcode generic-to-scoped listener flow and session-id rebinding
- [x] 3.2 Add queued prompt handling and session persistence
- [x] 3.3 Add timeline/checkpoint panel, slash commands panel, and preview controls (opcode parity)
- [x] 3.4 Update project/session browser to use opcode endpoints and new session metadata

## 4. Validation
- [x] 4.1 Add unit tests for Claude project/session parsing helpers and registry output buffering
- [x] 4.2 Run targeted Rust + frontend tests or document manual verification steps
