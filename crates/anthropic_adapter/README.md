# Anthropic Adapter

Anthropic API to OpenAI API adapter for Bodhi with capability-based model mapping.

## Features

- **Protocol Conversion**: Convert between Anthropic and OpenAI API formats
- **Capability-Based Mapping**: Map models by capability (background, thinking, long_context, default)
- **Environment Variable Support**: Configure via environment variables
- **Config File Support**: Load from `~/.bodhi/anthropic_model_mapping.json`
- **Backward Compatibility**: Supports old model-to-model mapping format

## Usage

### Basic Conversion

```rust
use anthropic_adapter::{
    convert_messages_request,
    convert_messages_response,
    resolve_model,
};

// Convert Anthropic request to OpenAI
let openai_request = convert_messages_request(anthropic_request)?;

// Convert OpenAI response back to Anthropic format
let anthropic_response = convert_messages_response(openai_response, "claude-3-opus")?;

// Resolve model with capability-based mapping
let resolution = resolve_model("claude-3-opus");
// resolution.mapped_model -> "gpt-4-turbo" (or configured value)
// resolution.capability -> ModelCapability::Thinking
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BODHI_MODEL_DEFAULT` | Default/general purpose model | `gpt-4o` |
| `BODHI_MODEL_BACKGROUND` | Fast/lightweight tasks | Same as default |
| `BODHI_MODEL_THINKING` | Reasoning tasks | Same as default |
| `BODHI_MODEL_LONG_CONTEXT` | Long context tasks | Same as default |

### Config File

Location: `~/.bodhi/anthropic_model_mapping.json`

```json
{
  "default_model": "gpt-4o",
  "background_model": "gpt-4o-mini",
  "thinking_model": "gpt-4-turbo",
  "long_context_model": "gpt-4o-128k"
}
```

Priority: Environment variables > Config file > Default values

## Model Capability Detection

The adapter automatically detects model capabilities from Anthropic model names:

| Anthropic Model | Detected Capability |
|-----------------|---------------------|
| `claude-3-haiku` | Background |
| `claude-instant` | Background |
| `claude-3-opus` | Thinking |
| `*-200k`, `*-128k` | LongContext |
| Other models | Default |

## API Endpoints

The adapter supports:

- `/v1/messages` - Anthropic Messages API
- `/v1/complete` - Anthropic Complete API (legacy)

Both endpoints accept Anthropic format and return Anthropic format, while internally using OpenAI-compatible APIs.

## Example: Custom Model Mapping

```rust
use anthropic_adapter::CapabilityModelMapping;

let mut mapping = CapabilityModelMapping::load();
mapping.set_model(ModelCapability::Thinking, "o1-preview".to_string());
mapping.set_model(ModelCapability::Background, "gpt-4o-mini".to_string());
mapping.save()?;
```

## Integration with web_service

Add to `Cargo.toml`:

```toml
[dependencies]
anthropic_adapter = { path = "../anthropic_adapter" }
```

Use in controller:

```rust
use anthropic_adapter::{resolve_model, convert_messages_request};

let resolution = resolve_model(&request.model);
let mut openai_request = convert_messages_request(request)?;
openai_request.model = resolution.mapped_model;
```
