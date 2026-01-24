## Context
Bodhi already detects Claude installations and exposes settings, but users still need to run npm manually. This change introduces an npm-driven installer flow inside Bodhi with clear feedback and safety checks.

## Goals / Non-Goals
- Goals:
  - Provide a first-class install/update flow for Claude Code and Claude Code router using npm.
  - Support explicit install scope (global vs project-local) and configurable package names.
  - Surface progress, stdout/stderr, and actionable errors in the UI.
- Non-Goals:
  - Implement alternative installers (brew, curl, system packages) in this change.
  - Manage npm itself beyond detecting availability and version.

## Decisions
- Implement npm detection/install in a new `claude_installer` crate with a stable interface for reuse.
- Expose HTTP endpoints under `/v1/claude/install` that call into the crate and stream output to the UI.
- Store default package names (placeholders) and global install scope in Bodhi settings with user override.
- Require explicit confirmation before executing npm installs.

## Risks / Trade-offs
- Running npm introduces environment differences (PATH, npmrc, permissions).
  - Mitigation: detect npm, show resolved npm version/path, and present clear errors with the full command.
- Global installs may require elevated permissions.
  - Mitigation: support project-local installs and prompt when global install fails.

## Migration Plan
- Add settings defaults and keep them optional; existing users are unaffected until they opt in.

## Open Questions
- What are the exact npm package names for Claude Code and the Claude Code router?
