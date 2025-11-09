# API Path Distinction - Critical Design Decision

## Summary

System prompt enhancement (tool injection) will **only apply to our context-based API**, while **preserving original prompts for OpenAI-compatible passthrough endpoints**.

## The Two API Modes

### 1. Passthrough Mode (OpenAI Compatible)

**API Paths**: `/v1/chat/completions`, `/v1/models`

**Clients**: External integrations like Cline, Continue, any OpenAI-compatible client

**Behavior**:

- ✅ Use **base system prompt** (no enhancement)
- ❌ **NO** tool definitions injected
- ❌ **NO** agent loop enabled
- ❌ **NO** Mermaid instructions added
- ✅ Preserve standard OpenAI API behavior

**Why**: External clients expect standard OpenAI API compatibility. Adding our custom tool definitions would break their expectations and potentially confuse their LLMs.

**Example Request**:

```bash
POST /v1/chat/completions
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello"}
  ]
}
```

→ System prompt remains: "You are a helpful assistant." (unchanged)

---

### 2. Context Mode (Our System)

**API Paths**: `/context/*`, custom chat endpoints

**Clients**: Our frontend application

**Behavior**:

- ✅ Use **enhanced system prompt** (base + tools + mermaid)
- ✅ Tool definitions injected in XML format
- ✅ Agent loop enabled (LLM can chain tool calls)
- ✅ JSON tool call format instructions included
- ✅ Mermaid diagram generation instructions included

**Why**: Our frontend is designed to work with the enhanced prompt and agent capabilities. We control the full interaction flow.

**Example Request**:

```bash
POST /context/chat/send
{
  "chat_id": "abc123",
  "message": "Read the README.md file",
  "system_prompt_id": "default"
}
```

→ System prompt becomes:

```
You are a helpful assistant.

<tools>
  <tool>
    <name>read_file</name>
    <description>Read contents of a file</description>
    <parameters>
      <parameter name="path" type="string" required="true">Path to file</parameter>
    </parameters>
  </tool>
  ...
</tools>

When you need to use a tool, output ONLY a JSON object:
{"tool": "tool_name", "parameters": {...}, "terminate": false}
...
```

---

## Detection Logic

### Request Path Analysis

```rust
fn is_passthrough_mode(req: &HttpRequest) -> bool {
    let path = req.path();

    // Passthrough mode for standard OpenAI endpoints
    if path.starts_with("/v1/chat/completions")
        || path.starts_with("/v1/models") {
        return true;
    }

    // Context mode for our custom endpoints
    if path.starts_with("/context/") {
        return false;
    }

    // Default to passthrough for safety (preserve compatibility)
    true
}
```

### Prompt Selection

```rust
async fn prepare_system_prompt(
    req: &HttpRequest,
    prompt_id: &str,
    enhancer: &SystemPromptEnhancer
) -> String {
    if is_passthrough_mode(req) {
        // External client - use original prompt
        system_prompt_service.get_base_prompt(prompt_id).await
    } else {
        // Our frontend - use enhanced prompt
        enhancer.enhance_prompt(prompt_id).await
    }
}
```

---

## Implementation Checklist

- [ ] Add `is_passthrough_mode()` detection in `openai_controller.rs`
- [ ] Route passthrough requests to base prompts
- [ ] Route context requests through `SystemPromptEnhancer`
- [ ] Disable agent loop for passthrough mode
- [ ] Test with Cline/external clients (should work unchanged)
- [ ] Test with our frontend (should have tools and agent loop)
- [ ] Add integration tests for both modes
- [ ] Document the distinction in API documentation

---

## Testing Strategy

### Test Case 1: Passthrough Mode (Cline)

```bash
# Simulate Cline connecting to our server
POST /v1/chat/completions
Authorization: Bearer [cline_token]

Expected:
- System prompt is unchanged
- No tools in prompt
- LLM responds normally without tool calling
- Standard OpenAI API response format
```

### Test Case 2: Context Mode (Our Frontend)

```bash
# Our frontend chat request
POST /context/chat/send
Authorization: Bearer [our_token]

Expected:
- System prompt includes tools
- LLM can output JSON tool calls
- Agent loop activates on terminate:false
- Tool results fed back to LLM automatically
```

### Test Case 3: Migration Safety

```bash
# Before deployment: ensure no breaking changes
# Run both test suites:
1. External client tests (Cline simulation)
2. Our frontend E2E tests

Both must pass before deployment.
```

---

## Benefits of This Approach

✅ **Backward Compatibility**: External clients continue working without changes

✅ **Flexibility**: We can enhance our system without affecting integrations

✅ **Clear Separation**: Passthrough vs enhanced logic is isolated

✅ **Safety**: Default to passthrough mode if path is ambiguous

✅ **Standard Compliance**: Maintains OpenAI API compatibility

---

## Risks and Mitigations

### Risk 1: Path Detection Fails

**Risk**: Misidentifying request mode could break external clients or disable our features

**Mitigation**:

- Explicit path prefix matching
- Default to passthrough (safer)
- Comprehensive integration tests
- Monitor logs for misidentified requests

### Risk 2: External Client Sends Custom Prompt

**Risk**: External client sends a prompt that expects tool calling, but we don't enhance it

**Mitigation**:

- This is expected behavior (external clients control their own prompts)
- If external clients want tool calling, they should implement it themselves
- We don't override their prompts

### Risk 3: Configuration Drift

**Risk**: Different environments might have different path routing

**Mitigation**:

- Hardcode path prefixes (not configurable)
- Include in integration tests
- Document clearly in code

---

## Future Considerations

### Option: Allow External Clients to Opt-In

In the future, we could allow external clients to explicitly request enhanced mode:

```bash
POST /v1/chat/completions
X-Enable-Tools: true  # Custom header to opt-in

→ Would enable tool enhancement even on passthrough endpoint
```

This is **NOT** in scope for initial implementation, but noted as a future enhancement.

---

## Summary Table

| Feature                  | Passthrough Mode                     | Context Mode              |
| ------------------------ | ------------------------------------ | ------------------------- |
| **API Paths**            | `/v1/chat/completions`, `/v1/models` | `/context/*`              |
| **Clients**              | Cline, Continue, external            | Our frontend              |
| **System Prompt**        | Base (original)                      | Enhanced (tools injected) |
| **Tool Definitions**     | ❌ Not included                      | ✅ Injected as XML        |
| **Agent Loop**           | ❌ Disabled                          | ✅ Enabled                |
| **JSON Tool Calls**      | ❌ Not parsed                        | ✅ Parsed and executed    |
| **OpenAI Compatibility** | ✅ Fully compatible                  | ⚠️ Custom behavior        |
| **Mermaid Instructions** | ❌ Not included                      | ✅ Included               |

---

**Status**: ✅ Validated and ready for implementation

**Priority**: 🔴 CRITICAL - Must be implemented correctly to maintain external client compatibility






