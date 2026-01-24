## 1. Backend (Rust/HTTP)
- [x] 1.1 Create `claude_installer` crate with npm detect/install interface and settings model
- [x] 1.2 Add web_service endpoints under `/v1/claude/install` for npm detect and install, streaming output
- [x] 1.3 Wire settings storage for npm package names and install scope (default global)

## 2. Frontend
- [x] 2.1 Add service layer wrappers for `/v1/claude/install` detect/install endpoints
- [x] 2.2 Add UI in System Settings to configure package names, scope, and trigger installs (show update as informational)
- [x] 2.3 Show progress/output and error states in the installer UI

## 3. Validation
- [x] 3.1 Add unit tests for settings validation and command argument construction
- [x] 3.2 Document manual verification steps for npm install flow

## Verification Notes
- Ran `cargo test -p claude_installer`
- Ran `cargo test -p web_service --lib`
- Ran `npm run build`
- Manual: open System Settings > Claude Installer, detect npm, install Claude Code and Router, verify output streaming and last install timestamps
- Manual (Agent mode): open Agent view > Tools > Installer and run the same flow
