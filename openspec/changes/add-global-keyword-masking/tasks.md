## 1. Implementation

- [ ] 1.1 Define keyword masking settings schema and defaults in app settings
- [ ] 1.2 Add Tauri commands to get/update keyword masking configuration with validation
- [ ] 1.3 Implement message masking in copilot_client request assembly
- [ ] 1.4 Add masking utilities/tests for exact and regex matches
- [ ] 1.5 Build settings UI for managing keywords (add/edit/remove/enable)
- [ ] 1.6 Wire UI to settings API and persist changes

## 2. Validation

- [ ] 2.1 openspec validate add-global-keyword-masking --strict
- [ ] 2.2 npm run test:run
- [ ] 2.3 cargo test
