## 1. Implementation

- [ ] 1.1 Add JSON read/write helpers for `~/.bodhi/config.json` (Claude settings) and `~/.bodhi/keyword_masking.json`.
- [ ] 1.2 Replace SQLite usage for Claude binary path and installation preference with JSON config reads/writes.
- [ ] 1.3 Replace SQLite usage for keyword masking Tauri commands with JSON file persistence.
- [ ] 1.4 Update copilot client keyword masking load to read `keyword_masking.json`.
- [ ] 1.5 Update Settings UI with example dropdown + masked preview helpers.
- [ ] 1.6 Remove `rusqlite` dependencies and clean up Cargo manifests/lockfiles.
- [ ] 1.7 Add tests for JSON settings helpers and keyword masking load behavior.

## 2. Validation

- [ ] 2.1 Run relevant Rust and frontend tests.
- [ ] 2.2 Run `openspec validate refactor-settings-storage-json --strict`.
