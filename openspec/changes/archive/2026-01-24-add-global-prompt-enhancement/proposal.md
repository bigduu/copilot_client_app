## Why

Users cannot configure a global system prompt enhancement, so enhanced guidance is fixed and cannot be edited.

## What Changes

- Add a global, editable system prompt enhancement setting in System Settings
- Persist the enhancement content for reuse across sessions
- Append the enhancement content to the selected system prompt before requests are sent to the model

## Impact

- Affected specs: system-prompt-enhancement
- Affected code: system prompt settings UI, prompt assembly pipeline, local storage preferences
