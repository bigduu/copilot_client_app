# Agent-LLM Protocol Conversion Architecture

## 📋 Overview

This document describes the hub-and-spoke protocol conversion system implemented in `crates/agent-llm/src/protocol/`.

## 🎯 Design Goals

1. **Single Source of Truth**: Internal types (`agent_core::Message`, `ToolSchema`) serve as the canonical representation
2. **Minimal Conversion Surface**: N protocols require only 2N conversions (not N²)
3. **Type Safety**: All conversions are verified at compile time
4. **Ergonomic API**: Clean, intuitive traits for conversion
5. **Extensibility**: Easy to add new providers

## 🏗️ Architecture

### Hub-and-Spoke Model

```
         ┌────────────────────────────┐
         │   Internal Types (Hub)     │
         │                            │
         │  ┌──────────────────────┐  │
         │  │ agent_core::Message  │  │
         │  │ agent_core::ToolSchema│ │
         │  │ agent_core::ToolCall │  │
         │  └──────────────────────┘  │
         └────────────────────────────┘
                      ▲    │
          FromProvider│    │ToProvider
                      │    ▼
    ┌──────────────────┐  ┌──────────────────┐
    │  Provider Types  │  │  Provider Types  │
    │  (Spoke 1)       │  │  (Spoke 2)       │
    │                  │  │                  │
    │  OpenAI API      │  │  Anthropic API   │
    │  ChatMessage     │  │  AnthropicMessage│
    │  Tool            │  │  AnthropicTool   │
    │  ToolCall        │  │  ToolUse         │
    └──────────────────┘  └──────────────────┘
```

### Conversion Flow

```
External Format A → Internal Format → External Format B
      (Spoke 1)      (Hub)              (Spoke 2)
```

## 📦 Module Structure

```
crates/agent-llm/src/protocol/
├── mod.rs          # Core traits: FromProvider, ToProvider
├── errors.rs       # ProtocolError enum
├── openai.rs       # OpenAI protocol implementation
├── anthropic.rs    # Anthropic protocol implementation
└── (future)
    ├── gemini.rs   # Future: Google Gemini
    └── mistral.rs  # Future: Mistral AI
```

## 🔑 Core Traits

### FromProvider (Spoke → Hub)

Converts provider-specific types to internal types.

```rust
pub trait FromProvider<T>: Sized {
    fn from_provider(value: T) -> ProtocolResult<Self>;
}
```

**Example:**
```rust
impl FromProvider<OpenAIChatMessage> for Message {
    fn from_provider(msg: OpenAIChatMessage) -> ProtocolResult<Self> {
        // OpenAI → Internal conversion logic
    }
}
```

### ToProvider (Hub → Spoke)

Converts internal types to provider-specific types.

```rust
pub trait ToProvider<T>: Sized {
    fn to_provider(&self) -> ProtocolResult<T>;
}
```

**Example:**
```rust
impl ToProvider<AnthropicMessage> for Message {
    fn to_provider(&self) -> ProtocolResult<AnthropicMessage> {
        // Internal → Anthropic conversion logic
    }
}
```

### Batch Conversion

```rust
pub trait ToProviderBatch<T>: Sized {
    fn to_provider_batch(&self) -> ProtocolResult<Vec<T>>;
}

// Implemented for Vec<Message>
impl ToProviderBatch<OpenAIChatMessage> for Vec<Message> { /* ... */ }
```

## 🔄 Supported Conversions

### OpenAI Protocol

| Direction | Type Mapping |
|-----------|-------------|
| OpenAI → Internal | `ChatMessage` → `Message` |
| Internal → OpenAI | `Message` → `ChatMessage` |
| OpenAI → Internal | `Tool` → `ToolSchema` |
| Internal → OpenAI | `ToolSchema` → `Tool` |
| OpenAI → Internal | `ToolCall` → `ToolCall` |
| Internal → OpenAI | `ToolCall` → `ToolCall` |

**Special Handling:**
- Content parts (text + images) are flattened to text
- Role enum values map directly

### Anthropic Protocol

| Direction | Type Mapping |
|-----------|-------------|
| Anthropic → Internal | `AnthropicMessage` → `Message` |
| Internal → Anthropic | `Message` → `AnthropicMessage` |
| Anthropic → Internal | `AnthropicTool` → `ToolSchema` |
| Internal → Anthropic | `ToolSchema` → `AnthropicTool` |

**Special Handling:**
- System messages are extracted to top-level `system` field
- Tool calls become `tool_use` blocks in content
- Tool results become `tool_result` blocks in user messages
- Content blocks vs text string

## 🎭 Protocol-Specific Behaviors

### OpenAI

```rust
// OpenAI keeps everything in messages array
let openai_request = vec![
    ChatMessage { role: System, content: "You are helpful", ... },
    ChatMessage { role: User, content: "Hello", ... },
];
```

### Anthropic

```rust
// Anthropic extracts system to top level
let anthropic_request = AnthropicRequest {
    system: Some("You are helpful"),
    messages: vec![
        AnthropicMessage { role: User, content: ..., ... },
    ],
};
```

## 🧪 Testing Strategy

### Unit Tests

Each protocol module includes comprehensive tests:

```rust
#[test]
fn test_openai_to_internal_simple_message() { /* ... */ }

#[test]
fn test_roundtrip_conversion() {
    // Internal → Provider → Internal should preserve data
    let original = Message::user("Hello");
    let provider_msg: OpenAIChatMessage = original.to_provider().unwrap();
    let roundtrip: Message = Message::from_provider(provider_msg).unwrap();

    assert_eq!(roundtrip.role, original.role);
    assert_eq!(roundtrip.content, original.content);
}
```

### Integration Tests

Run with:
```bash
cargo test -p agent-llm --lib protocol
```

## 🔮 Adding a New Provider

To add support for a new LLM provider:

### Step 1: Define Provider Types

```rust
// protocol/newprovider.rs
pub struct NewProviderMessage {
    pub role: String,
    pub content: String,
    // ...
}
```

### Step 2: Implement FromProvider

```rust
impl FromProvider<NewProviderMessage> for Message {
    fn from_provider(msg: NewProviderMessage) -> ProtocolResult<Self> {
        let role = match msg.role.as_str() {
            "user" => Role::User,
            "assistant" => Role::Assistant,
            // ...
        };

        Ok(Message {
            role,
            content: msg.content,
            // ...
        })
    }
}
```

### Step 3: Implement ToProvider

```rust
impl ToProvider<NewProviderMessage> for Message {
    fn to_provider(&self) -> ProtocolResult<NewProviderMessage> {
        let role = match self.role {
            Role::User => "user".to_string(),
            Role::Assistant => "assistant".to_string(),
            // ...
        };

        Ok(NewProviderMessage {
            role,
            content: self.content.clone(),
            // ...
        })
    }
}
```

### Step 4: Add Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_newprovider_to_internal() { /* ... */ }

    #[test]
    fn test_internal_to_newprovider() { /* ... */ }

    #[test]
    fn test_roundtrip_conversion() { /* ... */ }
}
```

### Step 5: Export in mod.rs

```rust
// protocol/mod.rs
pub mod newprovider;
pub use newprovider::NewProviderProtocol;
```

## 📊 Performance Considerations

- **Zero-cost abstractions**: Traits are monomorphized at compile time
- **No runtime dispatch**: All conversions resolved statically
- **Minimal allocations**: Most conversions are field-by-field copies
- **Error handling**: `ProtocolResult<T>` avoids panics

## 🔒 Error Handling

```rust
pub enum ProtocolError {
    Serialization(serde_json::Error),
    InvalidRole(String),
    InvalidContent(String),
    MissingField(String),
    UnsupportedFeature { feature: String, protocol: String },
    InvalidToolCall(String),
    InvalidStreamChunk(String),
    Conversion(String),
}
```

## 📚 Usage Patterns

### Pattern 1: Direct Conversion

```rust
let internal = Message::user("Hello");
let openai: OpenAIChatMessage = internal.to_provider()?;
```

### Pattern 2: Cross-Protocol

```rust
// OpenAI → Internal → Anthropic
let openai_msg = /* ... */;
let internal: Message = Message::from_provider(openai_msg)?;
let anthropic: AnthropicMessage = internal.to_provider()?;
```

### Pattern 3: Batch Processing

```rust
let messages = vec![
    Message::system("Be helpful"),
    Message::user("Hello"),
];

let openai_messages: Vec<OpenAIChatMessage> = messages.to_provider_batch()?;
```

## 🎓 Best Practices

1. **Store as Internal**: Always store messages as `agent_core::Message` in your application
2. **Convert at Boundaries**: Convert to provider types only at API boundaries
3. **Handle Errors**: Don't unwrap conversion errors in production code
4. **Test Round-Trips**: Ensure data preservation through conversions
5. **Document Differences**: Note protocol-specific behaviors in comments

## 🔗 Related Files

- `PROTOCOL_GUIDE.md` - User-facing usage guide
- `protocol/mod.rs` - Trait definitions
- `protocol/openai.rs` - OpenAI implementation
- `protocol/anthropic.rs` - Anthropic implementation

## 🤝 Contributing

When adding new conversions:

1. Follow the existing pattern in `openai.rs` or `anthropic.rs`
2. Add comprehensive tests for all conversion directions
3. Document protocol-specific behaviors
4. Update this architecture document
5. Add examples to `PROTOCOL_GUIDE.md`

## 📜 History

- **Initial Design**: Hub-and-spoke architecture chosen to avoid N² conversion matrix
- **Rationale**: With N providers, we need only 2N conversions (not N(N-1))
- **Migration**: Old conversion code in `providers/common/openai_compat.rs` and `providers/anthropic/mod.rs` is being migrated to this new system
