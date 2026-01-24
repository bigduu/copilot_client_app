## Why

Agent mode currently behaves like a single active Claude session. To match opcode,
users need multiple concurrent sessions that keep streaming in the background and
are quickly switchable via tabs.

## What Changes

- Add tabbed multi-session UI in Agent mode for running sessions
- Keep per-session stream buffers and context while switching tabs
- Allow multiple concurrent Claude CLI processes without killing prior sessions
- Track per-session process handles and live output in the backend registry
- Ensure backend live output and running-session APIs support concurrent sessions
- **BREAKING**: None

## Impact

- Affected specs: claude-code-frontend-sync, claude-code-backend-compat
- Affected code: AgentView UI/state, stream listeners/buffers, claude process spawn
  + registry/session tracking
