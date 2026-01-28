## Context

The UI is a single-page frontend that currently groups code by technical layers. Page layouts (chat, agent, settings) are composed from components stored together with unrelated UI components. Hooks, services, stores, and utils are also mostly top-level, which makes feature ownership unclear and makes it harder to reason about what belongs to which page or domain.

## Goals / Non-Goals

- Goals:
  - Organize UI by page layout so that sidebar/header/view components live together with their page.
  - Co-locate feature-specific hooks/services/store/types with the feature that owns them.
  - Consolidate shared modules into a shared area and reduce top-level directories.
  - Isolate unused code under `src/deprecated/` and keep it out of active imports.
- Non-Goals:
  - No UI/behavior changes or new features.
  - No backend or API changes.

## Decisions

- Decision: Introduce a minimal top-level structure focused on pages and shared modules (reduce top-level folders).

  Proposed structure (example):

  - `src/app/` entry wiring and app-level providers
  - `src/pages/` page layouts and page-owned modules (components/hooks/services/store/types/utils)
  - `src/shared/` reusable UI primitives, hooks, services, types, utils
  - `src/deprecated/` isolated unused code (tracked in `src/deprecated/INDEX.md`)
  - `src/assets/`, `src/styles/` remain as needed

- Decision: Page folders own their layout and layout-specific components.

  Example (Chat page):

  - `src/pages/ChatPage/ChatPage.tsx` (page shell)
  - `src/pages/ChatPage/layout/` (sidebar/view/header composition)
  - `src/pages/ChatPage/components/` (page-only UI pieces)

- Decision: Page folders co-locate the domain logic they own.

  Example (Chat page):

  - `src/pages/ChatPage/components/`
  - `src/pages/ChatPage/hooks/`
  - `src/pages/ChatPage/services/`
  - `src/pages/ChatPage/store/`
  - `src/pages/ChatPage/types/`

- Decision: Shared folders contain truly reusable modules.

  Example:

  - `src/shared/components/` (reused UI)
  - `src/shared/hooks/` (cross-feature hooks)
  - `src/shared/services/` (generic services)
  - `src/shared/utils/` (general utilities)
  - `src/shared/types/` (shared types)

- Decision: Context usage should be minimal and placed inside the owning page or shared module. If a context is only used within a single page, it belongs in that page folder.

## Risks / Trade-offs

- A large file-move diff increases the risk of broken imports and merge conflicts with other active changes.
- Moving modules can temporarily disrupt test paths and local development until imports are updated.

## Migration Plan

1. Inventory current modules and map them to pages, features, shared, or deprecated.
2. Create new directories and move modules incrementally, updating imports as each group moves.
3. Update page entry points (`App.tsx`, layout wiring) to the new locations.
4. Update tests and run frontend checks.

## Open Questions

- Confirm the final list of page folders (ChatPage, AgentPage, SettingsPage, others).
- Confirm which modules are deprecated and should be moved into `src/deprecated/` during the refactor.
