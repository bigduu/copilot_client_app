## Why

The frontend currently calls a mix of HTTP endpoints and Tauri commands that do not fully match the backend implementation, and large files + cross-layer coupling make changes risky. We need a single endpoint/command-driven view of functionality, reduce code smells, move deprecated code out of active paths, and allow internal storage refactors while keeping API compatibility.

## What Changes

- Create and maintain an endpoint/command map that links backend contracts to frontend call sites.
- Refactor frontend state scope and logic separation so components are smaller and responsibilities are clearer.
- Refactor backend controllers/commands to align with the map and remove or quarantine deprecated paths.
- Move unused/deprecated code into `src/deprecated` and `crates/deprecated`.
- Allow internal storage changes while keeping existing HTTP APIs and Tauri commands backward compatible.

## Impact

- Affected specs: `endpoint-command-contracts`, `frontend-state-boundaries`, `deprecated-code-quarantine`
- Affected code: `src/services`, `src/components`, `src/hooks`, `src/store`, `src-tauri/src/command`, `crates/web_service`, `crates/*` related to API/commands
