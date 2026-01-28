## 1. Preparation

- [ ] 1.1 Inventory current frontend folders and map modules to page, feature, shared, or deprecated buckets
- [ ] 1.2 Confirm page list and page layout ownership (chat, agent, settings, others)
- [ ] 1.3 Identify deprecated modules and update `src/deprecated/INDEX.md` entries

## 2. Restructure

- [ ] 2.1 Create the new top-level folders (`app`, `pages`, `features`, `shared`) and baseline indexes
- [ ] 2.2 Move page layout components into `src/pages/<PageName>/` and update imports
- [ ] 2.3 Move feature-specific hooks/services/store/types into `src/features/<feature>/`
- [ ] 2.4 Move shared utilities/components into `src/shared/`
- [ ] 2.5 Move deprecated modules into `src/deprecated/` and remove active imports

## 3. Wiring Updates

- [ ] 3.1 Update app entry points and layout wiring to new locations
- [ ] 3.2 Update test imports and snapshots to new paths

## 4. Validation

- [ ] 4.1 Run frontend tests (`npm run test:run` or targeted tests)
- [ ] 4.2 Run a production build (`npm run build`)
