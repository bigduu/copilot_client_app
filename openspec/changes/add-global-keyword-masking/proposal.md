## Why

Users need to prevent sensitive tokens and identifiers from being sent to the Copilot API. Global keyword masking provides a consistent, user-configurable safeguard across all chats without requiring per-message edits.

## What Changes

- Add a global keyword masking configuration stored in app settings
- Mask message content before sending ChatCompletionRequest payloads to the Copilot API
- Support exact string and regex-based keyword patterns
- Provide a settings UI to add, edit, enable/disable, and remove keywords
- Add Tauri settings commands for managing the configuration

## Impact

- Affected specs: keyword-masking-config, message-content-filter, settings-api, ui-components
- Affected code: crates/copilot_client/src/api/client.rs, src-tauri/src/command/, settings UI components
