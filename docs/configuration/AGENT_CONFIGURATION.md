# Agent System Configuration

This document describes the configuration options for the agent system, including agent loops, tool execution, and system prompt enhancement.

## Configuration Methods

Configuration can be provided through:
1. **Environment variables** (recommended for production)
2. **Default values** (suitable for development)

## Agent Loop Configuration

Controls the behavior of autonomous agent execution loops.

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENT_MAX_ITERATIONS` | integer | `10` | Maximum number of iterations in a single agent loop. Prevents infinite loops. |
| `AGENT_TIMEOUT_SECS` | integer | `300` | Total timeout for entire agent execution in seconds (5 minutes). |
| `AGENT_MAX_JSON_RETRIES` | integer | `3` | Maximum retries when LLM output cannot be parsed as valid JSON. |
| `AGENT_MAX_TOOL_RETRIES` | integer | `3` | Maximum retries for a specific tool execution failure. |
| `AGENT_TOOL_TIMEOUT_SECS` | integer | `60` | Timeout for individual tool execution in seconds (1 minute). |

### Usage Example

```bash
# Development - use defaults
cargo run

# Production - with custom limits
export AGENT_MAX_ITERATIONS=20
export AGENT_TIMEOUT_SECS=600
export AGENT_TOOL_TIMEOUT_SECS=120
cargo run --release
```

### Tuning Guidelines

- **Small iterations (5-10)**: Good for predictable, short tasks
- **Medium iterations (10-20)**: Suitable for most use cases
- **Large iterations (20+)**: Complex multi-step operations, but monitor for runaway loops

- **Timeout**: Should be `iterations × average_tool_time + buffer`
- **Tool timeout**: Depends on slowest expected tool (file operations, searches, etc.)

## System Prompt Enhancement Configuration

Controls how system prompts are enhanced with tools, diagrams, and other features.

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PROMPT_ENABLE_TOOLS` | boolean | `true` | Inject tool definitions into system prompts. |
| `PROMPT_ENABLE_MERMAID` | boolean | `true` | Include Mermaid diagram generation instructions. |
| `PROMPT_CACHE_TTL_SECS` | integer | `300` | Cache enhanced prompts for this many seconds (5 minutes). |
| `PROMPT_MAX_SIZE` | integer | `100000` | Maximum prompt size in characters (100KB). |

### Usage Example

```bash
# Disable tools for passthrough mode
export PROMPT_ENABLE_TOOLS=false
export PROMPT_ENABLE_MERMAID=false

# Increase cache TTL for production
export PROMPT_CACHE_TTL_SECS=600

# Reduce prompt size for token limits
export PROMPT_MAX_SIZE=50000
```

### Tuning Guidelines

- **Enable Tools**: Required for agent mode. Disable for pure chat or external clients.
- **Cache TTL**: Balance between freshness and performance. Longer TTL = better performance.
- **Max Size**: Depends on LLM context window. Claude: ~100K, GPT-4: ~8K-32K.

## Loading Configuration in Code

### Rust (Backend)

```rust
use web_service::config::{load_agent_loop_config, load_enhancement_config};

// Load configurations
let agent_config = load_agent_loop_config();
let enhancement_config = load_enhancement_config();

// Use in services
let agent_service = AgentService::new(agent_config);
let enhancer = SystemPromptEnhancer::new(tool_registry, enhancement_config);
```

## Docker / Kubernetes Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  copilot_chat:
    image: copilot_chat:latest
    environment:
      - AGENT_MAX_ITERATIONS=15
      - AGENT_TIMEOUT_SECS=600
      - PROMPT_MAX_SIZE=80000
```

### Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: copilot-chat-config
data:
  AGENT_MAX_ITERATIONS: "15"
  AGENT_TIMEOUT_SECS: "600"
  PROMPT_MAX_SIZE: "80000"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: copilot-chat
spec:
  template:
    spec:
      containers:
      - name: app
        envFrom:
        - configMapRef:
            name: copilot-chat-config
```

## Monitoring & Observability

Monitor these metrics to tune configuration:

- **Agent loop iterations per request**: If frequently hitting `AGENT_MAX_ITERATIONS`, increase limit
- **Tool execution timeouts**: If tools frequently timeout, increase `AGENT_TOOL_TIMEOUT_SECS`
- **Prompt cache hit rate**: Low hit rate may indicate `PROMPT_CACHE_TTL_SECS` is too short
- **Prompt truncation events**: If prompts are truncated, consider increasing `PROMPT_MAX_SIZE` or reducing tool definitions

## Troubleshooting

### Agent loops timeout frequently

- Increase `AGENT_TIMEOUT_SECS`
- Reduce `AGENT_MAX_ITERATIONS` to fail faster
- Check if specific tools are slow (increase `AGENT_TOOL_TIMEOUT_SECS`)

### LLM returns invalid JSON

- Check `AGENT_MAX_JSON_RETRIES` is sufficient (3-5 recommended)
- Review system prompt for clarity
- Check LLM temperature settings (lower = more consistent)

### Prompts too large for LLM

- Reduce `PROMPT_MAX_SIZE`
- Disable `PROMPT_ENABLE_MERMAID` if not needed
- Filter tools by role/permission (reduce tool set)

### Poor performance

- Increase `PROMPT_CACHE_TTL_SECS` (less regeneration)
- Check cache hit rate in logs
- Consider persistent cache (Redis) for multi-instance deployments

