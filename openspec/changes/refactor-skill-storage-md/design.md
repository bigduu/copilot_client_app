## Context

Skills currently rely on a JSON store with enablement state and a separate agent-side JSON loader. This creates mismatches and parsing failures when users edit files manually.

## Goals / Non-Goals

- Goals:
  - Use a single Markdown file per skill with YAML frontmatter.
  - Use the same skill format for agent and web services.
  - Keep Settings skill UI read-only.
- Non-Goals:
  - Automatic migration from JSON to Markdown.
  - Skill editing UI.

## Decisions

- Store skills in `~/.bodhi/skills/<id>.md`.
- Use YAML frontmatter for structured fields and Markdown body for the prompt text.
- Treat `enabled_by_default` in frontmatter as the only enablement signal.
- Disable write endpoints in skill APIs (read-only list/get).

## Risks / Trade-offs

- Breaking change for users who rely on `skills.json`.
- Manual edits are now required to create/update skills.

## Migration Plan

- Document new Markdown format.
- Remove JSON loading and ensure read-only UI.
- Users recreate skills in Markdown (no auto-migration).

## Open Questions

- Should we support a minimal CLI or helper to scaffold Markdown skills later?
