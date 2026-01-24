## Why

Users need a configurable TODO list workflow and more flexible system prompt enhancements, but enhancements are currently a single blob with Mermaid as a hard-wired fallback.

## What Changes

- Add a system prompt enhancement pipeline: user-defined enhancement first, then system-provided enhancements
- Introduce toggles for Mermaid enhancement and TODO list generation in System Settings
- Append enabled system enhancements to the outgoing system prompt after the user enhancement
- Render TODO list messages in the conversation view when the backend emits structured TODO list messages

## Impact

- Affected specs: system-prompt-enhancement, todo-list-ui
- Affected code: system prompt enhancement utilities, System Settings UI, prompt assembly, message rendering
