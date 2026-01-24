## Overview

This change decomposes oversized modules into smaller, cohesive units while preserving behavior. The work is entirely structural and stays within existing feature folders to avoid architectural churn.

## Goals

- Reduce file size and improve readability/ownership boundaries.
- Preserve public exports and external call sites.
- Enable focused testing and clearer separation of concerns.

## Non-Goals

- No feature changes or API redesigns.
- No new dependencies or framework shifts.
- No broad renaming of user-facing concepts.

## Approach

1. **Inventory and grouping**: Use line counts to identify files over 300 lines and group them by area (Agent UI, Chat UI, Message rendering, Services, Hooks, Types).
2. **Extraction strategy**:
   - **React components**: Extract self-contained sections into subcomponents; pull shared UI logic into hooks.
   - **Hooks/services**: Split transport, parsing, and state management into helper modules; keep the primary entrypoint as the public surface.
   - **Types**: Move large unions or helper types into focused files and re-export from the original entrypoint.
3. **Co-location**: Keep new modules in the same feature directory to preserve discoverability.
4. **Behavior safety**: Keep public exports stable and prefer internal-only changes. Small improvements (naming, memoization, minor cleanup) are allowed when they are behavior-neutral.

## Trade-offs

- **Pros**: Smaller files, easier reviews, clearer ownership, improved reusability.
- **Cons**: Increased file count and initial navigation cost. Mitigated by co-location and index re-exports when needed.

## Validation

- Run unit tests and formatting (`npm run test:run`, `npm run format:check`).
- Ensure no new lint/type errors and that key UI flows still render.
