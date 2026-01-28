## Why

Agent mode fails to run Claude Code on Windows because discovered paths can resolve to non-executable shims and command spawning/version checks do not account for .cmd/.bat execution semantics. This blocks Windows users from running or resuming Claude sessions.

## What Changes

- Normalize and resolve Claude Code binary paths on Windows (prefer valid executables, handle npm shims)
- Execute Claude Code through Windows-compatible invocation when needed
- Normalize project path encoding/decoding for Windows so project IDs, listings, and UI labels are correct
- Adjust environment inheritance and PATH handling for Windows process spawn

## Impact

- Affected specs: claude-code-backend-compat, claude-code-frontend-sync
- Affected code: src-tauri/src/claude_binary.rs, src-tauri/src/command/claude_code.rs, AgentPage UI utilities
