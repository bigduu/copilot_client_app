## Why

Skills are currently stored in JSON and configured via the Settings UI, but this has caused format drift, parsing errors, and duplicate sources of truth between agent and web services. A single, human-editable Markdown file per skill will simplify authoring and make skill definitions easier to audit.

## What Changes

- Store each skill as a Markdown file with YAML frontmatter under `~/.bodhi/skills/*.md`.
- Remove JSON skill storage as a required source of truth (no compatibility shim).
- Make the Settings skill UI read-only (view/list only).
- Load the same Markdown skill definitions for both agent and web services.

## Impact

- Affected specs: `skill-system`
- Affected code: `crates/skill_manager`, `crates/web_service`, `crates/copilot-agent/crates/copilot-agent-server`, Settings UI
