## Why

Users want Bodhi to install Claude Code and the Claude Code router via npm directly from the app so setup is faster and consistent across machines.

## What Changes

- Add a new Rust crate (`claude_installer`) that exposes an interface for npm detection and installs (install-only in v1).
- Add an HTTP API under `/v1/claude/install` to allow the frontend to invoke npm detection and install actions.
- Add configuration for npm package names (placeholders) and install scope, defaulting to global scope.
- Provide UI and backend commands to detect npm, run installs, and surface progress/errors.
- Expose install/update guidance in the UI, with update noted as a future action.

## Impact

- Affected specs: `claude-installation`
- Affected code: new `claude_installer` crate, web_service HTTP endpoints, frontend installer service/UI, agent page onboarding
