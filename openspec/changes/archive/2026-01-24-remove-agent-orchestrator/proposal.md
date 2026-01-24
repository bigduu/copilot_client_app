## Why

`crates/agent_orchestrator` appears to be unused by the application entrypoints and adds
maintenance/compile surface area and architectural confusion.

## What Changes

- Remove the `agent_orchestrator` crate from the Cargo workspace.
- Delete `crates/agent_orchestrator/`.
- Update internal docs that describe the workspace crate layout.

## Impact

- Expected runtime impact: none (crate is not referenced by `src-tauri` or `web_service`).
- Affected code: `Cargo.toml` (workspace members), `crates/agent_orchestrator/`, docs (`AGENTS.md`,
  `CLAUDE.md`).
