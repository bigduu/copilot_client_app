# Settings Storage JSON Design

## Summary
Replace the SQLite app settings store with JSON files under `~/.bamboo`. Store Claude binary settings in `~/.bamboo/config.json` under a `claude` object, and store global keyword masking in `~/.bamboo/keyword_masking.json`. Remove the SQLite dependency entirely and update the Settings UI with an example dropdown and masking preview to guide users.

## Goals
- Eliminate the SQLite dependency and `agents.db` usage.
- Persist Claude binary settings in `~/.bamboo/config.json` under `claude`.
- Persist keyword masking entries in `~/.bamboo/keyword_masking.json`.
- Provide UI helpers (examples dropdown + preview) for keyword masking.

## Non-Goals
- Migrate existing `agents.db` data.
- Change masking semantics (still exact/regex with `[MASKED]`).
- Rework unrelated settings storage (installer settings, tool configs, etc.).

## Storage Layout
- `~/.bamboo/config.json`
  - Add `claude` object:
    - `binary_path`: string or absent
    - `installation_preference`: string (e.g. `system`) or absent
- `~/.bamboo/keyword_masking.json`
  - JSON-serialized `KeywordMaskingConfig` with `entries` array.

## Read/Write Behavior
- Reads:
  - Missing files return defaults (no Claude settings, empty masking list).
  - Invalid JSON returns a clear error for write paths and logs a warning for reads.
- Writes:
  - `config.json` updates only the `claude` object and preserves other keys.
  - `keyword_masking.json` is written atomically as a whole.

## UI Changes
- Add an “Examples” dropdown that populates pattern + match type.
- Add a sample input + masked preview so users can see the effect immediately.
- Keep the current list-based edit UX; no behavioral changes to validation.

## Error Handling
- If `config.json` is invalid, return a descriptive error and avoid clobbering it.
- If `keyword_masking.json` is invalid, surface an error in the UI and fall back to empty config for masking in the client.

## Testing
- Unit tests for JSON read/update helpers (preserve unrelated keys, default on missing).
- Unit tests for keyword masking file load behavior (missing file defaults, invalid JSON errors).

## Migration
- None. Existing `agents.db` data is ignored.
