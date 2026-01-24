## 1. Implementation

- [x] 1.1 Add a headless toggle (env + CLI flag for `web_service_standalone`)
- [x] 1.2 Update `CopilotAuthHandler::get_access_token` to respect headless mode (print instructions instead of browser/clipboard/dialog)
- [x] 1.3 Update docs for standalone mode (how to run headless and where to find the printed code)

## 2. Tests

- [x] 2.1 Add unit tests for headless decision logic (env parsing) and ensure no GUI code path is taken when enabled
- [x] 2.2 Run `cargo test -p copilot_client -p web_service_standalone`
