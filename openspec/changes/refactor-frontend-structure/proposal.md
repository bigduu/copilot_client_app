## Why

The frontend is currently organized mainly by technical type (components/hooks/services/contexts/store/utils/layouts), with many page-specific layout pieces and feature logic spread across folders. This makes maintenance and refactors slow, and it keeps unused code mixed with active modules instead of isolated.

## What Changes

- Reorganize the frontend into page-oriented folders (ChatPage/AgentPage/SettingsPage) with page layouts and their components co-located.
- Co-locate page-owned hooks/services/store/types within the owning page group, and keep shared utilities/components in a shared area.
- Isolate unused code under `src/deprecated/` and stop new imports from deprecated modules.

## Impact

- Affected specs: `frontend-structure` (new)
- Affected code: `src/components`, `src/hooks`, `src/services`, `src/contexts`, `src/store`, `src/utils`, `src/layouts`, `src/App.tsx`, `src/main.tsx`, related tests
