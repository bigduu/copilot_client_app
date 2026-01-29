## Context

The app currently stores a small set of settings (Claude binary path, keyword masking) in a local SQLite database (`agents.db`). The project already uses JSON configuration files in `~/.bodhi` for other capabilities. This change aligns app settings with the existing JSON-based configuration approach.

## Goals / Non-Goals

- Goals:
  - Remove SQLite dependency and `agents.db`
  - Use JSON files under `~/.bodhi` as the settings store
  - Preserve unrelated keys in `~/.bodhi/config.json`
  - Add UI helpers to guide keyword masking configuration
- Non-Goals:
  - Migrate data from existing SQLite settings
  - Change keyword masking semantics or validation rules

## Decisions

- Store Claude settings in `~/.bodhi/config.json` under a `claude` object
  - Keys: `binary_path`, `installation_preference`
- Store keyword masking entries in `~/.bodhi/keyword_masking.json`
- Reads default to empty/None when files are missing
- Invalid JSON yields explicit errors on write and safe defaults on read

## Risks / Trade-offs

- Losing existing SQLite settings is a breaking change, mitigated by explicit messaging and default fallbacks.
- Invalid JSON in `config.json` can block updates to Claude settings; we avoid clobbering and surface actionable errors.

## Migration Plan

- No migration. Ignore `agents.db` and rely on JSON files going forward.

## Open Questions

- None
