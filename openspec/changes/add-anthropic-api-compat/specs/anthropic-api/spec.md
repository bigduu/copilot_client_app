## ADDED Requirements
### Requirement: Anthropic Messages API compatibility
The system SHALL expose `POST /v1/messages` that accepts Anthropic Messages API request JSON and returns Anthropic-shaped response JSON.

#### Scenario: Non-streaming messages response
- **WHEN** a client sends a valid `/v1/messages` request with `stream` omitted or `false`
- **THEN** the response is HTTP 200 with a JSON body that includes `type: "message"`, `role: "assistant"`, `content` blocks, `model`, `stop_reason`, and `usage`.

#### Scenario: Streaming messages response
- **WHEN** a client sends a valid `/v1/messages` request with `stream: true`
- **THEN** the response is SSE with Anthropic event types (`message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`) and concludes with `[DONE]`.

### Requirement: Anthropic legacy completion compatibility
The system SHALL expose `POST /v1/complete` that accepts Anthropic legacy completion request JSON and returns Anthropic-shaped legacy completion responses.

#### Scenario: Non-streaming legacy completion
- **WHEN** a client sends a valid `/v1/complete` request with `prompt` and `max_tokens_to_sample`
- **THEN** the response is HTTP 200 with `type: "completion"`, `completion`, `model`, and `stop_reason`.

#### Scenario: Streaming legacy completion
- **WHEN** a client sends a valid `/v1/complete` request with `stream: true`
- **THEN** the response is SSE with JSON chunks that include `completion` and `stop_reason` fields and concludes with `[DONE]`.

### Requirement: Concurrent OpenAI compatibility
The system SHALL continue to serve existing OpenAI-compatible endpoints alongside Anthropic endpoints.

#### Scenario: OpenAI endpoints remain available
- **WHEN** a client sends requests to `/v1/chat/completions` or `/v1/models`
- **THEN** the responses follow the existing OpenAI-compatible schema.

### Requirement: Anthropic model mapping configuration
The system SHALL support configurable mapping from Anthropic model IDs to OpenAI-compatible model IDs via a config file and HTTP endpoint.

#### Scenario: Retrieve model mapping
- **WHEN** a client requests the model mapping configuration
- **THEN** the service returns the current mapping values stored in `~/.bodhi/anthropic-model-mapping.json`.

#### Scenario: Missing model mapping
- **WHEN** a client sends an Anthropic request with a model that has no configured mapping
- **THEN** the service logs a warning and falls back to the default model.
