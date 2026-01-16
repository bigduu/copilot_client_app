## Why
Remove deprecated legacy endpoints and storage migration paths now that we no longer support old clients or legacy stored contexts, reducing maintenance surface and confusion.

## What Changes
- **BREAKING** Remove deprecated tool approval endpoint `/v1/contexts/{id}/tools/approve`.
- **BREAKING** Remove legacy storage migration CLI and `StorageMigration` API.
- **BREAKING** Remove deprecated file-based storage provider for legacy contexts.
- Remove the unused `context_controller` re-export module.

## Impact
- Affected specs: backend-legacy-cleanup (new delta)
- Affected code: `crates/web_service`, `crates/web_service_standalone`
