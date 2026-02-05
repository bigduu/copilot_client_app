## Why

Users expect the model to understand which workspace a chat is operating in so file references and instructions align with the correct project root.

## What Changes

- Append a workspace context segment to the effective system prompt when a workspace path is configured for the chat.
- Omit the workspace segment when no workspace path is set.
- Surface the workspace segment in system prompt previews so the user sees the same prompt that is sent to the model.
- The workspace segment states the absolute workspace path and instructs the model to check the workspace first, then `~/.bodhi`, when asked to inspect files.

## Impact

- Affected specs: system-prompt-enhancement
- Affected code: system prompt assembly (shared utils + chat request mapping) and system prompt display components
