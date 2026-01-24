## 1. Implementation

- [x] 1.1 Define Anthropic request/response models and conversion helpers (Anthropic <-> OpenAI).
- [x] 1.2 Add `anthropic_controller` with `/v1/messages` and `/v1/complete` endpoints for streaming and non-streaming.
- [x] 1.3 Implement OpenAI stream chunk to Anthropic SSE event translation.
- [x] 1.4 Map Anthropic error shapes and usage fields consistently.
- [x] 1.5 Register Anthropic routes in the web service router.
- [x] 1.6 Add integration tests for Anthropic non-streaming and streaming behavior.
- [x] 1.7 Implement model mapping storage in `~/.bodhi/anthropic-model-mapping.json`.
- [x] 1.8 Add `GET/PUT /v1/bodhi/anthropic-model-mapping` endpoints to manage mappings.
- [x] 1.9 Apply model mapping for Anthropic requests and fall back to the default model when missing.
- [x] 1.10 Add tests covering mapping retrieval, update, and missing-mapping errors.
