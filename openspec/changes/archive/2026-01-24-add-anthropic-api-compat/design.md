## Context

The backend currently exposes OpenAI-compatible `/v1/chat/completions` and forwards requests to the Copilot OpenAI-compatible upstream. There is no Anthropic-compatible HTTP surface.

## Goals / Non-Goals

- Goals:
  - Add Anthropic-compatible `/v1/messages` and legacy `/v1/complete` endpoints.
  - Provide fully Anthropic-shaped JSON responses and streaming SSE events.
  - Keep existing OpenAI endpoints and behavior unchanged.
- Non-Goals:
  - Replace or refactor the Copilot client or upstream protocol.
  - Add new external dependencies unless required for schema handling.

## Decisions

- Implement Anthropic models and conversions in `web_service`, keeping `copilot_client` focused on OpenAI-compatible upstream requests.
- Convert Anthropic message content blocks into OpenAI chat messages:
  - `system` field -> OpenAI system message.
  - `content` blocks of type `text` -> OpenAI text content.
  - `tool_use` blocks -> OpenAI tool calls in assistant messages.
  - `tool_result` blocks -> OpenAI tool role messages with `tool_call_id`.
- Translate OpenAI responses to Anthropic:
  - Non-stream: map assistant text/tool calls into `content` blocks with `type` and `text`/`id`/`input` fields.
  - Stream: convert OpenAI stream deltas into Anthropic SSE events (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`) and end with `[DONE]`.
- Legacy `/v1/complete` requests map `prompt` to a user message; responses map assistant text into the `completion` field.
- Map errors into Anthropic error envelopes: `{ "type": "error", "error": { "type": "...", "message": "..." } }` with appropriate HTTP status codes.
- Add a model mapping configuration stored in `~/.bodhi/anthropic-model-mapping.json` and exposed via `GET/PUT /v1/bodhi/anthropic-model-mapping`.
- When no mapping is found, log a warning and fall back to the default model instead of erroring.

## Risks / Trade-offs

- Some Anthropic features (images, advanced tool choice, stop sequences) may not be supported by the upstream Copilot API; these should be validated and documented.
- Streaming translation requires buffering to emit correct Anthropic event ordering.
- Unmapped Anthropic model IDs may silently fall back to a default model if users forget to configure mappings.

## Migration Plan

No migration required; endpoints are additive.

## Open Questions

- Confirm expected behavior for image content blocks and unsupported tool choice options.
