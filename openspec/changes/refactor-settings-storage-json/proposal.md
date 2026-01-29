## Why

SQLite is currently used for lightweight app settings like the Claude binary path and keyword masking entries. This adds dependency weight and an extra data file (`agents.db`) despite the app already using JSON configs under `~/.bodhi`. Aligning settings storage to JSON reduces complexity and makes settings easier to inspect and edit.

## What Changes

- Remove SQLite (`rusqlite`) usage and stop reading/writing `agents.db`
- Persist Claude settings in `~/.bodhi/config.json` under a `claude` object
- Persist keyword masking settings in `~/.bodhi/keyword_masking.json`
- Add keyword masking UI helpers (example dropdown + masked preview)
- **BREAKING**: no migration from `agents.db` to JSON files

## Impact

- Affected specs: `claude-code-backend-compat`, `app-settings-storage` (new)
- Affected code: `src-tauri/src/claude_binary.rs`, `src-tauri/src/command/claude_code.rs`, `src-tauri/src/command/keyword_masking.rs`, `crates/copilot_client/src/api/client.rs`, `src/pages/SettingsPage/components/SystemSettingsPage/SystemSettingsKeywordMaskingTab.tsx`, `src-tauri/Cargo.toml`, `crates/copilot_client/Cargo.toml`
- Related changes: `add-global-keyword-masking` (storage assumptions should align with JSON files)
