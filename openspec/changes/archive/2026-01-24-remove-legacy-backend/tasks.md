## 1. Implementation

- [x] 1.1 Remove deprecated tool approval controller and route; update context controller module docs.
- [x] 1.2 Remove legacy storage migration CLI and `StorageMigration` module; clean storage exports.
- [x] 1.3 Remove deprecated `FileStorageProvider` and any references.
- [x] 1.4 Remove unused `context_controller` re-export and update controller module list.
- [x] 1.5 Drop now-unused dependencies from `web_service_standalone`.

## 2. Validation

- [x] 2.1 cargo check -p web_service -p web_service_standalone
