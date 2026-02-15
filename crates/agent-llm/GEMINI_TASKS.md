# Gemini Provider Implementation Tasks

## Overview

We need to implement `GeminiProvider` to complete the Gemini support in agent-llm.
The protocol conversion layer is already done, we need the actual provider implementation.

## Task List

### Task 1: Create GeminiProvider Struct

**File**: `crates/agent-llm/src/providers/gemini/mod.rs`

**Requirements**:
- Create `GeminiProvider` struct with:
  - `client: reqwest::Client`
  - `api_key: String`
  - `base_url: String` (default: "https://generativelanguage.googleapis.com/v1beta")
  - `model: String` (default: "gemini-pro")
- Implement constructor `new(api_key: impl Into<String>)`
- Implement builder methods:
  - `with_base_url(url: impl Into<String>) -> Self`
  - `with_model(model: impl Into<String>) -> Self`

**Reference**: Look at `providers/openai/mod.rs` for the pattern

---

### Task 2: Implement LLMProvider Trait

**File**: `crates/agent-llm/src/providers/gemini/mod.rs`

**Requirements**:
```rust
#[async_trait]
impl LLMProvider for GeminiProvider {
    async fn chat_stream(
        &self,
        messages: &[Message],
        tools: &[ToolSchema],
        max_output_tokens: Option<u32>,
    ) -> Result<LLMStream>;
}
```

**Implementation Steps**:
1. Convert messages using the new protocol:
   ```rust
   let mut request: GeminiRequest = messages.to_provider()?;
   request.tools = Some(tools.to_provider()?);
   if let Some(max_tokens) = max_output_tokens {
       request.generation_config = Some(json!({
           "maxOutputTokens": max_tokens
       }));
   }
   ```

2. Build HTTP request:
   - URL: `{base_url}/models/{model}:streamGenerateContent?key={api_key}`
   - Method: POST
   - Headers: `Content-Type: application/json`
   - Body: `request` (serialized to JSON)

3. Send request and handle errors

4. Parse SSE stream using `llm_stream_from_sse`

**Reference**: See `providers/anthropic/mod.rs` and `providers/openai/mod.rs`

---

### Task 3: Implement Gemini SSE Parser

**File**: `crates/agent-llm/src/providers/gemini/stream.rs` (new file)

**Requirements**:
- Create `GeminiStreamState` struct (similar to `AnthropicStreamState`)
- Implement SSE event parser for Gemini format:

```rust
pub fn parse_gemini_sse_event(
    state: &mut GeminiStreamState,
    event_type: &str,
    data: &str,
) -> Result<Option<LLMChunk>> {
    // Gemini sends JSON objects, not named events
    // Each chunk is a partial GeminiResponse

    // Extract text from: candidates[0].content.parts[].text
    // Extract tool calls from: candidates[0].content.parts[].functionCall
}
```

**Gemini SSE Format**:
```
data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}

data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"search","args":{"q":"test"}}}],"role":"model"}}]}

data: [DONE]
```

**Reference**: Look at `providers/anthropic/mod.rs` for stateful parser pattern

---

### Task 4: Update providers/mod.rs

**File**: `crates/agent-llm/src/providers/mod.rs`

**Requirements**:
- Add `pub mod gemini;`
- Add `pub use gemini::GeminiProvider;`

---

### Task 5: Add Tests

**File**: `crates/agent-llm/src/providers/gemini/mod.rs`

**Requirements**:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_provider() {
        let provider = GeminiProvider::new("test_key");
        assert_eq!(provider.api_key, "test_key");
    }

    #[test]
    fn test_with_model() {
        let provider = GeminiProvider::new("test_key")
            .with_model("gemini-pro-vision");
        assert_eq!(provider.model, "gemini-pro-vision");
    }

    // Add more tests for request building
}
```

---

### Task 6: Integration Test

**File**: `crates/agent-llm/tests/gemini_integration.rs` (new file)

**Requirements**:
- Test with mock server (using `wiremock`)
- Verify request format
- Verify response parsing
- Test error handling

**Note**: This is optional, can be done later

---

## Implementation Order

1. **Task 1 + Task 4**: Create basic struct and update mod.rs
2. **Task 3**: Implement SSE parser (can be done in parallel)
3. **Task 2**: Implement LLMProvider trait (depends on Task 3)
4. **Task 5**: Add unit tests
5. **Task 6**: Integration tests (optional)

## Key Differences from Other Providers

### API Endpoint
- OpenAI: `/v1/chat/completions`
- Anthropic: `/v1/messages`
- **Gemini**: `/v1beta/models/{model}:streamGenerateContent?key={api_key}`

### Authentication
- OpenAI: `Authorization: Bearer {api_key}`
- Anthropic: `x-api-key: {api_key}`
- **Gemini**: Query param `?key={api_key}`

### Response Format
- OpenAI: `choices[0].delta.content`
- Anthropic: `content_block_delta.delta.text`
- **Gemini**: `candidates[0].content.parts[0].text`

## Reference Files

- `providers/openai/mod.rs` - Simple provider pattern
- `providers/anthropic/mod.rs` - Stateful stream parsing
- `protocol/gemini.rs` - Type definitions and conversions
- `providers/common/sse.rs` - SSE stream utilities

## Testing

Run tests with:
```bash
cargo test -p agent-llm --lib providers::gemini
```

## Notes

- Use the new protocol conversion system: `messages.to_provider()?`
- Don't use old openai_compat helpers
- Follow existing error handling patterns
- Add proper logging with `log::debug!` and `log::error!`
