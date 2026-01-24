## 1. Discovery & Mapping
- [ ] 1.1 Inventory HTTP endpoints and Tauri commands and map current frontend usage.
- [ ] 1.2 Create an endpoint/command map doc and record mismatches.
- [ ] 1.3 Identify unused/deprecated code paths for quarantine.

## 2. Frontend Refactor
- [ ] 2.1 Create/normalize a centralized adapter layer for endpoint/command calls.
- [ ] 2.2 Re-scope state ownership (shared state in store slices, local UI state in components).
- [ ] 2.3 Split large components and extract business logic into hooks/services.
- [ ] 2.4 Update or add tests for refactored logic.

## 3. Backend Refactor
- [ ] 3.1 Align controllers/commands with the map while preserving API compatibility.
- [ ] 3.2 Refactor internal storage if needed and document changes.

## 4. Deprecated Quarantine
- [ ] 4.1 Move deprecated frontend code to `src/deprecated`.
- [ ] 4.2 Move deprecated backend code to `crates/deprecated`.
- [ ] 4.3 Add a brief index of quarantined code and reasons.

## 5. Validation
- [ ] 5.1 Run frontend tests (`npm run test:run`) and backend tests (`cargo test`).
- [ ] 5.2 Manual smoke check of key flows (chat, workflows, MCP).
