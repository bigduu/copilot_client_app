## ADDED Requirements

### Requirement: Page-Oriented UI Structure

The frontend SHALL organize page layouts and page-specific components under `src/pages/<PageName>/`, with layout-related components co-located with the page they serve.

#### Scenario: Page layout ownership

- **WHEN** a page owns layout pieces like a sidebar, header, or view
- **THEN** those components live inside the same `src/pages/<PageName>/` folder

### Requirement: Page-Owned Module Co-location

Page-specific hooks, services, store slices, types, and utilities SHALL live under the owning page folder `src/pages/<PageName>/`, and reusable modules shared across pages SHALL live under `src/shared/`.

#### Scenario: Page-specific hook placement

- **WHEN** a hook or service is only used by a single page
- **THEN** it is placed under that page's folder (for example `src/pages/<PageName>/hooks/`)

#### Scenario: Shared utility placement

- **WHEN** a utility is reused across multiple features or pages
- **THEN** it is placed under `src/shared/utils/`

### Requirement: Deprecated Code Isolation

Unused or deprecated frontend code SHALL be moved under `src/deprecated/`, and new production code SHALL NOT import from `src/deprecated/`.

#### Scenario: Isolating unused modules

- **WHEN** a module is no longer used by active UI flows
- **THEN** it is moved to `src/deprecated/` and removed from active imports
