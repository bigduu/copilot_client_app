# Protocol Conversion Guide

This guide explains how to use the hub-and-spoke protocol conversion system in `agent-llm`.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│         Internal Types (agent_core::Message)            │
│                                                          │
│  • Message (role, content, tool_calls)                  │
│  • ToolSchema (function definition)                     │
│  • ToolCall (function invocation)                       │
└──────────────────────────────────────────────────────────┘
                        ▲              │
            FromProvider │              │ ToProvider
                        │              ▼
        ┌───────────────┴──────────────┴──────────────┐
        │                 Hub & Spoke                  │
        └───────────────┬──────────────┬──────────────┘
                        │              │
                        ▼              │
    ┌───────────────────────────────────────────────────┐
    │  OpenAI API  │  Anthropic API  │  Gemini API     │
    │  Types       │  Types          │  Types          │
    └───────────────────────────────────────────────────┘
```

## Basic Usage

### 1. OpenAI ↔ Internal Conversion

```rust
use agent_llm::{FromProvider, ToProvider};
use agent_llm::api::models::ChatMessage as OpenAIChatMessage;
use agent_core::Message;

// OpenAI → Internal
let openai_msg = OpenAIChatMessage {
    role: Role::User,
    content: Content::Text("Hello".to_string()),
    tool_calls: None,
    tool_call_id: None,
};

let internal_msg: Message = Message::from_provider(openai_msg)?;

// Internal → OpenAI
let internal = Message::user("Hello");
let openai_msg: OpenAIChatMessage = internal.to_provider()?;
```

### 2. Anthropic ↔ Internal Conversion

```rust
use agent_llm::providers::anthropic::AnthropicMessage;
use agent_core::Message;

// Anthropic → Internal
let anthropic_msg = AnthropicMessage {
    role: AnthropicRole::User,
    content: AnthropicContent::Text("Hello".to_string()),
};

let internal: Message = Message::from_provider(anthropic_msg)?;

// Internal → Anthropic
let internal = Message::user("Hello");
let anthropic: AnthropicMessage = internal.to_provider()?;
```

### 3. Gemini ↔ Internal Conversion

```rust
use agent_llm::protocol::gemini::{GeminiContent, GeminiPart};
use agent_core::Message;

// Gemini → Internal
let gemini = GeminiContent {
    role: "user".to_string(),
    parts: vec![GeminiPart {
        text: Some("Hello".to_string()),
        function_call: None,
        function_response: None,
    }],
};

let internal: Message = Message::from_provider(gemini)?;

// Internal → Gemini
let internal = Message::user("Hello");
let gemini: GeminiContent = internal.to_provider()?;

// Note: Gemini uses "model" instead of "assistant"
let assistant = Message::assistant("Hi", None);
let gemini_assistant: GeminiContent = assistant.to_provider()?;
assert_eq!(gemini_assistant.role, "model");
```

### 4. Batch Conversion

```rust
use agent_llm::ToProviderBatch;

// Convert multiple messages at once
let messages = vec![
    Message::system("You are helpful"),
    Message::user("Hello"),
];

let openai_messages: Vec<OpenAIChatMessage> = messages.to_provider_batch()?;
```

## Advanced Examples

### Cross-Protocol Conversion

```rust
// Convert from OpenAI → Internal → Anthropic
let openai_msg = OpenAIChatMessage { /* ... */ };

// Step 1: OpenAI → Internal
let internal: Message = Message::from_provider(openai_msg)?;

// Step 2: Internal → Anthropic
let anthropic_msg: AnthropicMessage = internal.to_provider()?;

// Or OpenAI → Internal → Gemini
let gemini_msg: GeminiContent = internal.to_provider()?;
```

### Working with Tool Calls

```rust
use agent_core::tools::{ToolCall, FunctionCall};

// Create a message with tool calls
let tool_call = ToolCall {
    id: "call_1".to_string(),
    tool_type: "function".to_string(),
    function: FunctionCall {
        name: "search".to_string(),
        arguments: r#"{"q":"test"}"#.to_string(),
    },
};

let internal_msg = Message::assistant("Let me search", Some(vec![tool_call]));

// Convert to OpenAI format
let openai_msg: OpenAIChatMessage = internal_msg.to_provider()?;
assert!(openai_msg.tool_calls.is_some());

// Convert to Anthropic format (becomes tool_use blocks)
let anthropic_msg: AnthropicMessage = internal_msg.to_provider()?;
```

### System Message Handling

```rust
// Anthropic and Gemini extract system messages to top-level fields
let messages = vec![
    Message::system("You are helpful"),
    Message::user("Hello"),
];

// Anthropic: system → top-level `system` field
let anthropic_request: AnthropicRequest = messages.to_provider()?;
assert_eq!(anthropic_request.system, Some("You are helpful".to_string()));
assert_eq!(anthropic_request.messages.len(), 1); // Only user message

// Gemini: system → `systemInstruction` field
let gemini_request: GeminiRequest = messages.to_provider()?;
assert!(gemini_request.system_instruction.is_some());
let sys = gemini_request.system_instruction.unwrap();
assert_eq!(sys.parts[0].text, Some("You are helpful".to_string()));
assert_eq!(gemini_request.contents.len(), 1); // Only user message
```

## Extension Traits

For ergonomic usage, you can use extension traits:

```rust
use agent_llm::protocol::openai::OpenAIExt;

// Instead of:
let internal: Message = Message::from_provider(openai_msg)?;

// You can write:
let internal = openai_msg.into_internal()?;
```

## Error Handling

```rust
use agent_llm::ProtocolError;

match Message::from_provider(msg) {
    Ok(internal) => { /* ... */ },
    Err(ProtocolError::InvalidRole(role)) => {
        eprintln!("Invalid role: {}", role);
    }
    Err(ProtocolError::MissingField(field)) => {
        eprintln!("Missing required field: {}", field);
    }
    Err(e) => {
        eprintln!("Conversion error: {}", e);
    }
}
```

## Implementing a New Protocol

To add support for a new provider (e.g., Gemini):

```rust
// 1. Define provider types
pub struct GeminiMessage {
    pub role: String,
    pub parts: Vec<GeminiPart>,
}

// 2. Implement FromProvider
impl FromProvider<GeminiMessage> for Message {
    fn from_provider(msg: GeminiMessage) -> ProtocolResult<Self> {
        // Convert Gemini → Internal
        // ...
    }
}

// 3. Implement ToProvider
impl ToProvider<GeminiMessage> for Message {
    fn to_provider(&self) -> ProtocolResult<GeminiMessage> {
        // Convert Internal → Gemini
        // ...
    }
}

// 4. Use it!
let internal = Message::user("Hello");
let gemini: GeminiMessage = internal.to_provider()?;
```

## Best Practices

1. **Always use the internal types as the source of truth**
   - Store messages as `agent_core::Message`
   - Convert to provider types only when making API calls

2. **Handle conversion errors gracefully**
   - Check for `ProtocolError::UnsupportedFeature` when converting to provider types
   - Some features may not be supported in all protocols

3. **Test round-trip conversions**
   - Internal → Provider → Internal should preserve data
   - Use the provided test utilities

4. **Be aware of protocol-specific behaviors**
   - OpenAI: Standard format, `tool_calls` array, `tool_call_id` in responses
   - Anthropic: System messages extracted to top-level, `tool_use` blocks in content
   - Gemini: "model" role (not "assistant"), `parts[]` structure, grouped tool declarations
   - All handle tool results differently

## Protocol-Specific Behaviors Summary

| Feature | OpenAI | Anthropic | Gemini |
|---------|--------|-----------|--------|
| Assistant role name | `"assistant"` | `"assistant"` | `"model"` |
| System messages | In `messages[]` | Top-level `system` | Top-level `systemInstruction` |
| Tool calls | `tool_calls[]` array | `tool_use` blocks in content | `function_call` in `parts[]` |
| Tool results | `role: "tool"` | `tool_result` blocks in content | `function_response` in `parts[]` |
| Tool definitions | `tools[]` array | `tools[]` array | Single `tools[]` with `function_declarations[]` |
| Content structure | `content: string` or `parts[]` | `content: blocks[]` | `parts[]` always |

## Testing

The protocol module includes comprehensive tests:

```bash
# Run all protocol tests (OpenAI, Anthropic, Gemini)
cargo test -p agent-llm --lib protocol

# Run OpenAI-specific tests
cargo test -p agent-llm --lib protocol::openai

# Run Anthropic-specific tests
cargo test -p agent-llm --lib protocol::anthropic

# Run Gemini-specific tests
cargo test -p agent-llm --lib protocol::gemini

# Run specific test
cargo test -p agent-llm --lib protocol::openai::tests::test_roundtrip_conversion
```

## Migration Guide

### From Old openai_compat.rs

**Before:**
```rust
use crate::providers::common::openai_compat::messages_to_openai_compat_json;

let json = messages_to_openai_compat_json(&messages);
```

**After:**
```rust
use agent_llm::ToProviderBatch;

let openai_messages: Vec<OpenAIChatMessage> = messages.to_provider_batch()?;
```

### From Old Anthropoic mod.rs

**Before:**
```rust
use crate::providers::anthropic::build_anthropic_request;

let body = build_anthropic_request(&messages, &tools, "claude-3", 1024, true);
```

**After:**
```rust
use agent_llm::ToProvider;

let request: AnthropicRequest = messages.to_provider()?;
// request.system contains system messages
// request.messages contains non-system messages
```
