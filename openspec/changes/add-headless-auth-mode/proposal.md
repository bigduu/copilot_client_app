## Why
`web_service_standalone` may run in a terminal/CI/server environment where GUI capabilities are unavailable. Today, the GitHub device-code login flow attempts to:
- open a browser automatically
- copy the user code to the clipboard
- show a native dialog

This breaks (or hangs) in headless environments and prevents authentication.

## What Changes
- Add a "headless auth" mode for backend usage that:
  - does NOT auto-open the browser
  - does NOT use clipboard or native dialogs
  - prints the `verification_uri` + `user_code` to stdout/logs for manual copy/paste
- Add a `--headless` flag to `web_service_standalone` (and an env override) to enable this mode.

## Impact
- Affected code: `crates/copilot_client/src/auth/auth_handler.rs`, `crates/web_service_standalone/src/main.rs`
- Behavior: default (desktop-friendly) auth remains unchanged unless headless mode is enabled
