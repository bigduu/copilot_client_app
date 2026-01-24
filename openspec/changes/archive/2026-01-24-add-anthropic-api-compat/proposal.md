## Why

Clients need Anthropic API compatibility in addition to the existing OpenAI-compatible API so they can switch formats without changing the backend or losing streaming behavior.

## What Changes

- Add Anthropic-compatible endpoints for `/v1/messages` and legacy `/v1/complete`.
- Translate Anthropic request/response schemas to the existing Copilot OpenAI-compatible upstream.
- Stream Anthropic-shaped SSE events (`message_start`, `content_block_delta`, etc.) when `stream=true`.
- Preserve existing OpenAI-compatible endpoints and behavior.
- Add a configurable Anthropic→OpenAI model mapping (file-based and HTTP endpoint), and return an Anthropic error when no mapping exists.
- Add backend tests for Anthropic requests and streaming.

## Impact

- Affected specs: anthropic-api
- Affected code: `crates/web_service/src/controllers/`, `crates/web_service/src/services/`, `crates/web_service/src/server.rs`, `crates/copilot_client/src/api/` (if shared models/converters are needed)
