## Context
The application exposes functionality via a mix of HTTP endpoints (`/v1/*`) and Tauri commands. Several frontend services reference endpoints/commands that are not implemented, and large components blur state ownership and business logic. We also want to move deprecated code out of active paths while keeping API compatibility for existing clients.

## Goals / Non-Goals
- Goals:
  - Align functionality around the endpoint/command contracts and keep them backward compatible.
  - Reduce code smells (large files, duplicated logic, cross-layer coupling, state leakage, low cohesion).
  - Clarify frontend state scope and extract business logic into services/hooks.
  - Quarantine deprecated code in `src/deprecated` and `crates/deprecated`.
- Non-Goals:
  - Redesign API surface or change endpoint/command names or response envelopes.
  - Introduce new frameworks or major architectural rewrites beyond the refactor.

## Decisions
- Decision: Establish a single endpoint/command map as the source of truth for call sites.
  - Rationale: This makes mismatches obvious and keeps refactors anchored to contracts.
- Decision: Consolidate backend calls through centralized adapters/services and prohibit ad-hoc `fetch`/`invoke` in UI components.
  - Rationale: Improves cohesion and reduces cross-layer coupling.
- Decision: Quarantine deprecated code instead of deleting immediately.
  - Rationale: Allows incremental validation while keeping API compatibility.

## Risks / Trade-offs
- Risk: Refactor scope touches many files.
  - Mitigation: Small, verifiable tasks and keep API compatibility.
- Risk: Hidden dependencies on deprecated paths.
  - Mitigation: Quarantine with explicit index and verify with tests and smoke checks.

## Migration Plan
1. Inventory endpoints/commands and map frontend usage.
2. Refactor frontend state/logic around the map; split large components where needed.
3. Align backend handlers; move dead code to deprecated directories.
4. Validate with targeted tests and manual smoke checks.

## Open Questions
- Are any existing endpoints/commands intentionally unused but must remain implemented for external clients?
